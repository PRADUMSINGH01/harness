// hf-harness server: best-of-N runs around the vendored HyperFrames skills.
import express, { type NextFunction, type Request, type Response } from "express";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { HF_ROOT, HARNESS_ROOT, PORT, RUNS_DIR, BROWSER_CONCURRENCY, BUILD_CONCURRENCY } from "./config.ts";
import { axisValues, getGenre, HttpError, loadGenres } from "./genres.ts";
import { isInside } from "./util.ts";
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

const asyncRoute = (fn: (req: Request, res: Response) => Promise<unknown> | unknown) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve(fn(req, res)).catch(next);

app.get("/", (_req, res) => {
  res.json({
    service: "hf-harness",
    status: "ok",
    hyperframes: hfVersion(),
    endpoints: {
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
      ok: existsSync(join(HF_ROOT, "plugin.json")) && !!chrome,
      hyperframes: { version: hfVersion(), root: HF_ROOT, present: existsSync(join(HF_ROOT, "plugin.json")), cli: hfCli() },
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
    const dir = resolve(projectDir);
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
  const a = addAsset(req.body ?? {});
  res.status(201).json({ ...summary(a), url: `/assets/file?id=${encodeURIComponent(a.id)}` });
});

app.post("/assets/reindex", (_req, res) => {
  res.json(reindex());
});

// Builders without in-process tools (Claude Agent SDK, external) use these from their project.
function projectDirFrom(body: any): string {
  const dir = resolve(String(body?.projectDir ?? ""));
  if (!isInside(HARNESS_ROOT, dir)) throw new HttpError(400, "projectDir must be inside the harness folder");
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
app.use("/play/:id/:v", (req, res) => {
  const v = variantOf(mustRun(String(req.params.id)), String(req.params.v));
  const rel = decodeURIComponent(req.path === "/" ? "/index.html" : req.path);
  const file = resolve(v.dir, `.${rel}`);
  if (!file.startsWith(resolve(v.dir)) || !existsSync(file)) throw new HttpError(404, `no ${rel} in ${v.id}`);
  if (!file.toLowerCase().endsWith(".html")) return res.sendFile(file, { dotfiles: "allow" });
  const html = readFileSync(file, "utf8");
  const tag = `<script src="${RUNTIME_URL}"></script>`;
  const injected = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => `${m}\n${tag}`) : `${tag}\n${html}`;
  res.type("html").set("cache-control", "no-store").send(injected);
});

app.get("/ui", (_req, res) => {
  res.sendFile(join(HARNESS_ROOT, "public", "index.html"));
});

app.use((req, res) => {
  res.status(404).json({ error: `no route ${req.method} ${req.originalUrl}` });
});

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err instanceof HttpError ? err.status : (err.status ?? err.statusCode ?? 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message ?? String(err) });
});

const publicUrl = process.env.HARNESS_PUBLIC_URL ?? `http://localhost:${PORT}`;
setServerUrl(publicUrl);
// Express 5 calls this even when listen fails. A server that can't bind must exit before
// resumeAll(): two processes resuming the same runs race each other's builds.
app.listen(PORT, (err?: Error) => {
  if (err) {
    console.error(`hf-harness could not listen on ${PORT}: ${err.message}. Is another harness server running? Not resuming runs.`);
    process.exit(1);
  }
  console.log(`hf-harness on ${publicUrl} (hyperframes ${hfVersion()}, vendored at ${HF_ROOT})`);
  // An empty hyperframes/ (cloned without submodules) leaves builders with no skills and no doctrine.
  if (!existsSync(join(HF_ROOT, "plugin.json"))) {
    console.warn(`hf-harness: no HyperFrames clone at ${HF_ROOT}. Run \`git submodule update --init\` (or set HF_ROOT): without it builders get no workflow skills and the seam gate is skipped.`);
  }
  resumeAll();
});
