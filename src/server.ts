// hf-harness server: best-of-N runs around the vendored HyperFrames skills.
import express, { type NextFunction, type Request, type Response } from "express";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { API_KEY, HF_ROOT, HARNESS_ROOT, PORT, PUBLIC_URL, RUNS_DIR, BROWSER_CONCURRENCY, BUILD_CONCURRENCY } from "./config.ts";
import { axisValues, getGenre, HttpError, loadGenres } from "./genres.ts";
import { chromePath, hasBinary, hfCli, hfVersion, runHf } from "./hf.ts";
import { GATES, runGates } from "./gates/index.ts";
import { axisStats, readLessons } from "./memory.ts";
import { BUILDERS } from "./drivers/builder.ts";
import { JUDGES } from "./drivers/judge.ts";
import { bus, emit, history, type HarnessEvent } from "./events.ts";
import { getRun, listRuns, runDir, variantOf } from "./runs/store.ts";
import { addAsset, catalog, getAsset, reindex, searchAssets, summary } from "./assets/catalog.ts";
import { fetchLogo, useAsset } from "./assets/tools.ts";
import { renderJudgePacket } from "./runs/packets.ts";
import { getQuick, quickDir, renderQuick, startQuick } from "./templates/quick.ts";
import { apiKeyGuard, dataDir, mountApi } from "./api.ts";
import {
  acceptScorecards,
  advance,
  browserSlots,
  cancelRun,
  createRun,
  markBuilt,
  mustRun,
  readGateReport,
  regate,
  reopen,
  pauseRun,
  resumeAll,
  resumeRun,
  setServerUrl,
} from "./runs/orchestrator.ts";

const app = express();
app.use(express.json({ limit: "20mb" }));
app.use(apiKeyGuard());
const publicUrl = PUBLIC_URL;

const asyncRoute = (fn: (req: Request, res: Response) => Promise<unknown> | unknown) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve(fn(req, res)).catch(next);

app.get("/", (_req, res) => {
  res.json({
    service: "hf-harness",
    status: "ok",
    hyperframes: hfVersion(),
    docs: `${publicUrl}/docs`,
    openapi: `${publicUrl}/openapi.json`,
    endpoints: {
      launch: "GET /launch (paste a URL, get a website trailer)",
      quick: "POST /quick {url, mode: trailer|launch|templates, aspects?} -> 202 {id}; GET /quick, GET /quick/:id, DELETE /quick/:id",
      quickRender: "POST /quick/:id/render {template}; GET /quick/:id/download/:template",
      frames: "POST /frames {at:[s], quickId+template | projectDir}",
      sites: "POST /sites {url, refresh?}, GET /sites, GET /sites/:site, GET /sites/:site/preview, GET /sites/:site/parts/:name, DELETE /sites/:site",
      pageAnalysis: "POST /capture {url}, POST /brandkit {url}, POST /extract {url}",
      catalog: "GET /gates, GET /templates, GET /providers",
      ui: "GET /ui",
      health: "GET /health",
      genres: "GET /genres",
      memory: "GET /memory?genre=",
      gate: "POST /gate {projectDir, genre, browser?, only?}",
      createRun: "POST /runs {genre, brief:{message,...}, n?, builder?, judge?, judges?, locks?}",
      runs: "GET /runs",
      run: "GET /runs/:id",
      events: "GET /runs/:id/events (SSE; ?format=json for history)",
      packet: "GET /runs/:id/variants/:v/packet",
      built: "POST /runs/:id/variants/:v/built",
      regate: "POST /runs/:id/variants/:v/gate",
      gates: "GET /runs/:id/variants/:v/gates",
      judgePacket: "GET /runs/:id/judge-packet?judge=j1",
      scorecards: "POST /runs/:id/scorecards [scorecard, ...]",
      decision: "GET /runs/:id/decision",
      advance: "POST /runs/:id/advance",
      reopen: "POST /runs/:id/reopen",
      cancel: "POST /runs/:id/cancel",
      render: "POST /runs/:id/render",
      files: "GET /files/<runId>/<path>",
      play: "GET /play/<runId>/<variant>/ (composition with the HyperFrames runtime, for <hyperframes-player>)",
      assets: "GET /assets?q=&kind=&limit= (library search; ?kind=logo|photo|screenshot|illustration|icon|texture|lottie|video|audio|font|background|overlay|shape|doodle|mockup|chart|title|matte|frame)",
      assetItem: "GET /assets/item?id=, GET /assets/file?id=",
      assetUpload: "POST /assets {filename, dataBase64, name?, kind?, tags?, description?, brand?, license?}",
      assetReindex: "POST /assets/reindex",
      useAsset: "POST /projects/assets/use {projectDir, id, role?, required?}",
      fetchLogo: "POST /projects/assets/logo {projectDir, brand, role?}",
    },
  });
});

app.get(
  "/health",
  asyncRoute(async (_req, res) => {
    const [chrome, ffmpeg] = await Promise.all([chromePath(), hasBinary("ffmpeg")]);
    const check = async (drivers: Record<string, { check(): Promise<{ ok: boolean; reason?: string }> }>) =>
      Object.fromEntries(await Promise.all(Object.entries(drivers).map(async ([id, d]) => [id, await d.check()])));
    res.json({
      ok: existsSync(HF_ROOT) && !!chrome,
      hyperframes: { version: hfVersion(), root: HF_ROOT, present: existsSync(HF_ROOT) },
      node: process.version,
      chrome,
      ffmpeg,
      render: ffmpeg ? "local render available" : "no ffmpeg: gates and snapshots work, local render does not",
      builders: await check(BUILDERS),
      judges: await check(JUDGES),
      defaults: { builder: process.env.HARNESS_BUILDER ?? null, judge: process.env.HARNESS_JUDGE ?? null },
      concurrency: { browser: BROWSER_CONCURRENCY, build: BUILD_CONCURRENCY },
    });
  }),
);

app.get("/genres", (_req, res) => {
  res.json(
    Object.values(loadGenres()).map((g) => ({
      id: g.id,
      label: g.label,
      workflow: g.workflow,
      description: g.description,
      defaultVariants: g.defaultVariants,
      duration: g.duration,
      axes: g.axes.map((a) => ({ id: a.id, label: a.label, values: axisValues(a) })),
      judge: g.judge.dimensions.map((d) => ({ id: d.id, weight: d.weight })),
    })),
  );
});

app.get("/genres/:id", (req, res) => {
  const g = getGenre(String(req.params.id));
  res.json({ ...g, axes: g.axes.map((a) => ({ ...a, values: axisValues(a) })) });
});

app.get("/memory", (req, res) => {
  const genre = typeof req.query.genre === "string" ? req.query.genre : undefined;
  res.json({ lessons: readLessons(genre).length, axisStats: genre ? axisStats(genre) : undefined, recent: readLessons(genre).slice(-30) });
});

// Gate any HyperFrames project. Workers call this in their self-gate loop.
app.post(
  "/gate",
  asyncRoute(async (req, res) => {
    const { projectDir, genre, browser, only, quick } = req.body ?? {};
    if (!projectDir || !genre) throw new HttpError(400, "projectDir and genre are required");
    const dir = dataDir(projectDir);
    if (!existsSync(join(dir, "hyperframes.json"))) throw new HttpError(400, `not a HyperFrames project: ${dir}`);
    // quick: everything except the two slowest browser gates (proof snapshots, seam measurement).
    // Builders use it while iterating; the harness runs the full gate once the build is done.
    const gates = quick ? GATES.map((g) => g.id).filter((id) => id !== "seam" && id !== "snapshot") : only;
    const report = await runGates(dir, getGenre(genre), { browser: browser !== false, only: gates, withBrowserSlot: (fn) => browserSlots.run(fn) });
    res.json(report);
  }),
);

app.post(
  "/runs",
  asyncRoute(async (req, res) => {
    const run = await createRun(req.body ?? {});
    res.status(201).json(run);
  }),
);

app.get("/runs", (_req, res) => {
  res.json(
    listRuns().map((r) => ({
      id: r.id,
      genre: r.genre,
      status: r.status,
      message: r.brief.message,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      variants: r.variants.map((v) => ({ id: v.id, label: v.label, status: v.status, technical: v.gate?.technical ?? null, hardFail: v.gate?.hardFail ?? null })),
      winner: r.decision?.winner ?? null,
    })),
  );
});

app.get("/runs/:id", (req, res) => {
  res.json(mustRun(String(req.params.id)));
});

app.get("/runs/:id/events", (req, res) => {
  const run = mustRun(String(req.params.id));
  if (req.query.format === "json") return res.json(history(run.id, Number(req.query.limit ?? 500)));
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
  const send = (e: HarnessEvent) => res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
  for (const e of history(run.id, 100)) send(e);
  const listener = (e: HarnessEvent) => send(e);
  bus.on(`run:${run.id}`, listener);
  const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
  req.on("close", () => {
    clearInterval(ping);
    bus.off(`run:${run.id}`, listener);
  });
});

// The newest packet for a variant: the worker packet, or the latest repair packet after a failed gate.
app.get("/runs/:id/variants/:v/packet", (req, res) => {
  const run = mustRun(String(req.params.id));
  const v = variantOf(run, String(req.params.v));
  const dir = join(runDir(run.id), "packets");
  const files = existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.startsWith(`${v.id}.`))
        .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t)
    : [];
  if (!files.length) throw new HttpError(404, `no packet yet for ${v.id} (status ${v.status})`);
  res.type("text/markdown").send(readFileSync(join(dir, files[0].f), "utf8"));
});

app.post(
  "/runs/:id/variants/:v/built",
  asyncRoute(async (req, res) => {
    res.json(await markBuilt(String(req.params.id), String(req.params.v)));
  }),
);

app.post(
  "/runs/:id/variants/:v/gate",
  asyncRoute(async (req, res) => {
    await regate(String(req.params.id), String(req.params.v));
    res.status(202).json({ queued: true });
  }),
);

app.get("/runs/:id/variants/:v/gates", (req, res) => {
  const run = mustRun(String(req.params.id));
  const report = readGateReport(variantOf(run, String(req.params.v)));
  if (!report) throw new HttpError(404, "not gated yet");
  res.json(report);
});

// ---------- asset library ----------

app.get("/assets", (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : "";
  const kind = typeof req.query.kind === "string" && req.query.kind ? req.query.kind : undefined;
  const limit = Math.min(Number(req.query.limit ?? 60), 500);
  const counts: Record<string, number> = {};
  for (const a of catalog()) counts[a.kind] = (counts[a.kind] ?? 0) + 1;
  const items = q ? searchAssets(q, { kind, limit }) : catalog().filter((a) => !kind || a.kind === kind).slice(0, limit).map(summary);
  res.json({ total: catalog().length, counts, items: items.map((i) => ({ ...i, url: `/assets/file?id=${encodeURIComponent(i.id)}` })) });
});

app.get("/assets/item", (req, res) => {
  const a = getAsset(String(req.query.id ?? ""));
  if (!a) throw new HttpError(404, `no asset ${req.query.id}`);
  res.json({ ...a, path: relative(HARNESS_ROOT, a.path).split("\\").join("/"), url: `/assets/file?id=${encodeURIComponent(a.id)}` });
});

app.get("/assets/file", (req, res) => {
  const a = getAsset(String(req.query.id ?? ""));
  if (!a) throw new HttpError(404, `no asset ${req.query.id}`);
  res.sendFile(a.path);
});

// Upload: { filename, dataBase64, name?, kind?, tags?, description?, brand?, license? }
app.post("/assets", (req, res) => {
  // fromPath reads a file on this machine: only files inside the harness data folders.
  const body = { ...(req.body ?? {}) };
  if (body.fromPath) body.fromPath = dataDir(body.fromPath, "fromPath");
  const a = addAsset(body);
  res.status(201).json({ ...summary(a), url: `/assets/file?id=${encodeURIComponent(a.id)}` });
});

app.post("/assets/reindex", (_req, res) => {
  res.json(reindex());
});

// Builders without in-process tools (Claude Agent SDK, external) use these from their project.
function projectDirFrom(body: any): string {
  const dir = dataDir(body?.projectDir);
  if (!existsSync(join(dir, "hyperframes.json"))) throw new HttpError(400, `not a HyperFrames project: ${dir}`);
  return dir;
}

app.post("/projects/assets/use", (req, res) => {
  const { id, role, required, notes } = req.body ?? {};
  if (!id) throw new HttpError(400, "id is required");
  res.json(useAsset(projectDirFrom(req.body), String(id), { role, required, notes }));
});

app.post(
  "/projects/assets/logo",
  asyncRoute(async (req, res) => {
    const { brand, role, required, notes } = req.body ?? {};
    if (!brand) throw new HttpError(400, "brand is required");
    res.json(await fetchLogo(projectDirFrom(req.body), String(brand), { role, required, notes }));
  }),
);

// Full agent trace: thinking, plans, every tool call and result, timing and tokens.
// ?format=md for the readable log; otherwise JSON entries, ?since=N for only the new ones.
function sendTrace(dir: string, req: Request, res: Response) {
  if (req.query.format === "md") {
    const md = join(dir, "agent-log.md");
    if (!existsSync(md)) throw new HttpError(404, "no agent log yet");
    return res.type("text/markdown").send(readFileSync(md, "utf8"));
  }
  const jsonl = join(dir, "agent-log.jsonl");
  const lines = existsSync(jsonl) ? readFileSync(jsonl, "utf8").split(/\r?\n/).filter(Boolean) : [];
  const since = Math.max(0, Number(req.query.since ?? 0));
  res.json({ total: lines.length, entries: lines.slice(since).map((l) => JSON.parse(l)) });
}

app.get("/runs/:id/variants/:v/agent-log", (req, res) => {
  const v = variantOf(mustRun(String(req.params.id)), String(req.params.v));
  sendTrace(join(v.dir, ".harness"), req, res);
});

app.get("/runs/:id/judge-log/:judge", (req, res) => {
  const run = mustRun(String(req.params.id));
  sendTrace(join(runDir(run.id), "judge", String(req.params.judge)), req, res);
});

app.get("/runs/:id/judge-packet", (req, res) => {
  const run = mustRun(String(req.params.id));
  const eligible = run.variants.filter((v) => v.status === "gated" && !v.gate?.hardFail);
  if (!eligible.length) throw new HttpError(409, "no gated, non-vetoed variants to judge yet");
  const judge = typeof req.query.judge === "string" ? req.query.judge : "j1";
  res.type("text/markdown").send(renderJudgePacket(run, getGenre(run.genre), judge, eligible).text);
});

app.post(
  "/runs/:id/scorecards",
  asyncRoute(async (req, res) => {
    const run = mustRun(String(req.params.id));
    const cards = Array.isArray(req.body) ? req.body : (req.body?.cards ?? [req.body]);
    const result = acceptScorecards(run, getGenre(run.genre), cards);
    void advance(run.id);
    res.status(result.rejected.length ? 422 : 200).json(result);
  }),
);

app.get("/runs/:id/decision", (req, res) => {
  const run = mustRun(String(req.params.id));
  const p = join(runDir(run.id), "DECISION.md");
  if (!existsSync(p)) throw new HttpError(404, `not decided yet (status ${run.status})`);
  if (req.accepts(["text/markdown", "json"]) === "json") return res.json(run.decision);
  res.type("text/markdown").send(readFileSync(p, "utf8"));
});

app.post(
  "/runs/:id/advance",
  asyncRoute(async (req, res) => {
    await advance(mustRun(String(req.params.id)).id);
    res.json(getRun(String(req.params.id)));
  }),
);

app.post("/runs/:id/reopen", (req, res) => {
  res.json(reopen(String(req.params.id)));
});

app.post("/runs/:id/pause", (req, res) => {
  res.json(pauseRun(String(req.params.id)));
});

app.post("/runs/:id/resume", (req, res) => {
  res.json(resumeRun(String(req.params.id)));
});

app.post("/runs/:id/cancel", (req, res) => {
  cancelRun(String(req.params.id));
  res.json(getRun(String(req.params.id)));
});

// Render the winner. Rendering needs ffmpeg; the harness never pretends otherwise.
app.post(
  "/runs/:id/render",
  asyncRoute(async (req, res) => {
    const run = mustRun(String(req.params.id));
    const winner = run.variants.find((v) => v.id === run.decision?.winner);
    if (!winner) throw new HttpError(409, "no winner to render yet");
    const cmd = `${hfCli()} render . --skill=${run.workflow} -q high -o renders/video.mp4`;
    if (!(await hasBinary("ffmpeg"))) {
      throw new HttpError(409, `ffmpeg is not installed, so local render is unavailable. Install ffmpeg, or run in ${winner.dir}: ${cmd}`);
    }
    emit(run.id, "render.started", winner.dir);
    res.status(202).json({ started: true, dir: winner.dir, output: join(winner.dir, "renders", "video.mp4") });
    const r = await runHf(["render", ".", `--skill=${run.workflow}`, "-q", "high", "-o", "renders/video.mp4"], { cwd: winner.dir, timeoutMs: 3_600_000 });
    emit(run.id, r.code === 0 ? "render.done" : "render.failed", r.code === 0 ? join(winner.dir, "renders", "video.mp4") : (r.stderr || r.stdout).slice(-600));
  }),
);

// Snapshots, compare sheets, contact sheets. `.harness` is a dot-directory, so allow dotfiles.
app.use("/files", express.static(RUNS_DIR, { dotfiles: "allow", fallthrough: false }));

// Watch a variant without rendering: serve its files with the HyperFrames runtime injected at
// parse time, as Studio does. Compositions write window.__timelines[...] at load, so the
// player's own late runtime injection comes too late for them.
const RUNTIME_URL = `https://cdn.jsdelivr.net/npm/@hyperframes/core@${hfVersion()}/dist/hyperframe.runtime.iife.js`;
// Serve a composition with the HyperFrames runtime injected at parse time, so the player can seek it.
function serveComposition(dir: string, label: string, req: Request, res: Response) {
  const rel = decodeURIComponent(req.path === "/" ? "/index.html" : req.path);
  const file = resolve(dir, `.${rel}`);
  if (!file.startsWith(resolve(dir)) || !existsSync(file)) throw new HttpError(404, `no ${rel} in ${label}`);
  if (!file.toLowerCase().endsWith(".html")) return res.sendFile(file, { dotfiles: "allow" });
  const html = readFileSync(file, "utf8");
  const tag = `<script src="${RUNTIME_URL}"></script>`;
  const injected = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => `${m}\n${tag}`) : `${tag}\n${html}`;
  res.type("html").set("cache-control", "no-store").send(injected);
}

app.use("/play/:id/:v", (req, res) => {
  const v = variantOf(mustRun(String(req.params.id)), String(req.params.v));
  serveComposition(v.dir, v.id, req, res);
});

// Quick mode (templates, option C): POST starts a job, GET polls it, /quick-play serves a result.
app.post("/quick", (req, res) => {
  res.status(202).json(startQuick(req.body ?? {}));
});
app.post("/quick/:id/render", async (req, res) => {
  if (!(await hasBinary("ffmpeg"))) throw new HttpError(409, "MP4 render needs FFmpeg on PATH (winget install --id Gyan.FFmpeg -e). Gates and the player work without it.");
  res.status(202).json(await renderQuick(String(req.params.id), String(req.body?.template ?? "")));
});
app.get("/quick/:id", (req, res) => {
  const q = getQuick(String(req.params.id));
  if (!q) throw new HttpError(404, `no quick job ${req.params.id}`);
  res.json({ ...q, play: q.results.map((r) => `${publicUrl}/quick-play/${q.id}/${r.template}/`) });
});
// A plain page with every video of a quick job, playable side by side.
const esc = (x: string) => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Launch page: paste a URL, choose formats, get launch films. No commands needed.
const PAGE_CSS = `body{margin:0;padding:28px;background:#0b0c0e;color:#eee;font:16px system-ui,sans-serif}h1{font-size:22px;margin:0 0 6px}p{color:#9a9a9a;margin:0 0 20px}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(560px,1fr));gap:22px;align-items:start}figure{margin:0}
hyperframes-player{display:block;width:100%;aspect-ratio:16 / 9;background:#000;border-radius:10px;overflow:hidden}.tall hyperframes-player{aspect-ratio:9 / 16;max-width:400px}
a{color:#ff9b7a}figcaption{margin-top:8px}form{display:grid;gap:14px;max-width:640px}input[type=url],textarea{width:100%;box-sizing:border-box;padding:12px 14px;border-radius:10px;border:1px solid #333;background:#15161a;color:#eee;font:16px system-ui}
button{padding:12px 22px;border:0;border-radius:999px;background:#ff5a36;color:#111;font:600 16px system-ui;cursor:pointer;justify-self:start}label{color:#bbb}.err{color:#ff7a7a}`;

app.get("/launch", (_req, res) => {
  res.type("html").send(`<!doctype html><html><head><meta charset="utf-8"><title>Launch film</title><style>${PAGE_CSS}</style></head><body>
<h1>Make a website trailer</h1><p>Paste a landing page. The harness clones its real components as code (header, hero, feature cards, sections, buttons, fonts, icons) and films them as a trailer of up to 60 seconds, in the site's own theme.</p>
<form id="f"><input type="url" name="url" placeholder="https://yourproduct.com" required>
<textarea name="brief" rows="3" placeholder="Optional: anything the film must say (offer, audience, launch date)"></textarea>
<label><input type="checkbox" name="landscape" checked> Landscape 16:9 (YouTube, website)</label>
<label><input type="checkbox" name="vertical"> Vertical 9:16 (Reels, Shorts, TikTok)</label>
<button>Make the trailer</button><div class="err" id="err"></div></form>
<script>
document.getElementById("f").onsubmit = async (e) => {
  e.preventDefault();
  const d = new FormData(e.target);
  const aspects = [d.get("landscape") && "16:9", d.get("vertical") && "9:16"].filter(Boolean);
  if (!aspects.length) aspects.push("16:9");
  const r = await fetch("/quick", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: d.get("url"), brief: d.get("brief") || undefined, mode: "trailer", aspect: aspects[0], aspects }) });
  const j = await r.json();
  if (!r.ok) return (document.getElementById("err").textContent = j.error || "failed");
  location.href = "/quick-view/" + j.id;
};
</script></body></html>`);
});

app.get("/quick-view/:id", (req, res) => {
  const q = getQuick(String(req.params.id));
  if (!q) throw new HttpError(404, `no quick job ${req.params.id}`);
  const phases = Object.entries(q.phases).map(([k, v]) => `${k} ${v}s`).join(" · ");
  if (q.status !== "done") {
    // Still working (or failed): a status page that refreshes itself.
    return res.type("html").send(`<!doctype html><html><head><meta charset="utf-8"><title>Working: ${q.id}</title>${q.status === "running" ? '<meta http-equiv="refresh" content="4">' : ""}<style>${PAGE_CSS}</style></head>
<body><h1>${esc(q.request.url)}</h1><p>${q.status === "running" ? "Reading the site and building the film… this page refreshes by itself." : `<span class="err">Failed: ${esc(q.error ?? "unknown error")}</span>`}</p><p>${phases || "starting"}</p></body></html>`);
  }
  const cards = q.results
    .filter((r) => !r.error)
    .map((r) => {
      const tall = /vertical/.test(r.template) || (!/landscape/.test(r.template) && q.request.aspect === "9:16");
      const mp4 = r.render?.file
        ? ` · <a href="/quick-play/${q.id}/${r.template}/${r.render.file}" download>Download MP4</a>`
        : r.render?.status === "rendering"
          ? " · rendering MP4…"
          : r.hardFail
            ? ""
            : ` · <a href="#" data-render="${r.template}">Render MP4</a>`;
      return `<figure class="${tall ? "tall" : ""}"><hyperframes-player src="/quick-play/${q.id}/${r.template}/" controls muted autoplay loop></hyperframes-player><figcaption>${r.template.replace(/-/g, " ")} · ${r.durationSec ? `${r.durationSec}s · ` : ""}quality ${r.technical ?? "?"}/100${r.hardFail ? " · <span class=err>failed checks</span>" : ""}${mp4}</figcaption></figure>`;
    })
    .join("");
  res.type("html").send(`<!doctype html><html><head><meta charset="utf-8"><title>Videos: ${q.id}</title>
<script type="module" src="https://cdn.jsdelivr.net/npm/@hyperframes/player@${hfVersion()}/dist/hyperframes-player.js"></script>
<style>${PAGE_CSS}</style></head>
<body><h1>${esc(q.request.url)}</h1><p>${q.results.length} video${q.results.length === 1 ? "" : "s"} made in ${q.totalSec ?? "?"} seconds (${phases}) · <a href="/launch">make another</a></p><main>${cards}</main><p class="err" id="err"></p>
<script>
for (const a of document.querySelectorAll("[data-render]")) a.onclick = async (e) => {
  e.preventDefault();
  const r = await fetch("/quick/${q.id}/render", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ template: a.dataset.render }) });
  if (!r.ok) return (document.getElementById("err").textContent = (await r.json()).error);
  setTimeout(() => location.reload(), 1500);
};
</script></body></html>`);
});

app.use("/quick-play/:id/:t", (req, res) => {
  const dir = resolve(quickDir(String(req.params.id)), String(req.params.t));
  if (!dir.startsWith(resolve(quickDir(String(req.params.id)))) || !existsSync(dir)) throw new HttpError(404, "no such quick result");
  serveComposition(dir, String(req.params.t), req, res);
});

app.get("/ui", (_req, res) => {
  res.sendFile(join(HARNESS_ROOT, "public", "index.html"));
});

mountApi(app);

app.use((req, res) => {
  res.status(404).json({ error: `no route ${req.method} ${req.originalUrl}` });
});

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err instanceof HttpError ? err.status : (err.status ?? err.statusCode ?? 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message ?? String(err) });
});

setServerUrl(publicUrl);
// Express 5 calls this even when listen fails. A server that can't bind must exit before
// resumeAll(): two processes resuming the same runs race each other's builds.
app.listen(PORT, (err?: Error) => {
  if (err) {
    console.error(`hf-harness could not listen on ${PORT}: ${err.message}. Is another harness server running? Not resuming runs.`);
    process.exit(1);
  }
  console.log(`hf-harness on ${publicUrl} (hyperframes ${hfVersion()}, vendored at ${HF_ROOT}; API docs at ${publicUrl}/docs${API_KEY ? "; API key required" : ""})`);
  resumeAll();
});
