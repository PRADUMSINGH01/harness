// The rest of the API: routes for every harness function the run and quick routes don't already
// cover (site clones, captures, brand kits, page extraction, frames, templates, providers, gates,
// quick-job management), the optional API key, and the OpenAPI document with its /docs page.
import type { Express, NextFunction, Request, Response } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { API_KEY, HARNESS_ROOT, PUBLIC_URL, RUNS_DIR } from "./config.ts";
import { HttpError } from "./genres.ts";
import { isInside } from "./util.ts";
import { runHf } from "./hf.ts";
import { GATES } from "./gates/index.ts";
import { TEMPLATES } from "./templates/library.ts";
import { checkProvider, providers } from "./llm/providers.ts";
import { captureFor, getQuick, listQuick, QUICK_DIR, quickDir, SITES_DIR, siteDirFor, siteIdFor } from "./templates/quick.ts";
import { ensureClone, type CloneKit } from "./launch/clone.ts";
import { ensureSiteParts } from "./launch/extract.ts";
import { ensureBrandKit } from "./runs/brandkit.ts";
import { openapi } from "./openapi.ts";

const asyncRoute = (fn: (req: Request, res: Response) => Promise<unknown> | unknown) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve(fn(req, res)).catch(next);

// ---------- API key ----------

// Routes anyone may call: liveness for load balancers and the API description.
const OPEN = new Set(["/health", "/openapi.json", "/docs"]);
const digest = (s: string) => createHash("sha256").update(s).digest();
const sameKey = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));
const cookieOf = (req: Request, name: string) =>
  (req.headers.cookie ?? "")
    .split(";")
    .map((c) => c.trim().split("="))
    .find(([k]) => k === name)?.[1];

// Machines send `x-api-key: <key>` or `Authorization: Bearer <key>`. A browser opens any page once
// with `?key=<key>`; the key comes back as a cookie, so the launch page, its player and its fetches
// keep working without headers.
export function apiKeyGuard(key: string | undefined = API_KEY) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!key || OPEN.has(req.path)) return next();
    const bearer = req.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    const query = typeof req.query.key === "string" ? req.query.key : undefined;
    const cookie = cookieOf(req, "hf_key");
    const given = req.get("x-api-key") ?? bearer ?? query ?? (cookie ? decodeURIComponent(cookie) : undefined);
    if (!given || !sameKey(given, key)) {
      res.status(401).json({ error: "API key required: send the x-api-key header or Authorization: Bearer <key>; in a browser, open the page once with ?key=<key>" });
      return;
    }
    if (query) res.setHeader("set-cookie", `hf_key=${encodeURIComponent(query)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
    next();
  };
}

// ---------- shared helpers ----------

// Folders the API may read projects from: the harness itself and its data roots (which env vars can move).
const DATA_ROOTS = () => [HARNESS_ROOT, RUNS_DIR, QUICK_DIR];
export function dataDir(path: unknown, what = "projectDir"): string {
  if (typeof path !== "string" || !path.trim()) throw new HttpError(400, `${what} is required`);
  const dir = resolve(path);
  if (!DATA_ROOTS().some((root) => isInside(root, dir))) throw new HttpError(400, `${what} must be inside the harness data folders (runs/, quick/)`);
  return dir;
}

const urlOf = (body: any): string => {
  const url = String(body?.url ?? "").trim();
  if (!/^https?:\/\/[^\s]+$/i.test(url)) throw new HttpError(400, "url is required (http:// or https://)");
  return url;
};

const siteId = (req: Request) => {
  const id = String(req.params.site ?? "");
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(id)) throw new HttpError(400, `bad site id ${id}`);
  return id;
};
const readKit = (id: string): CloneKit => {
  const file = join(SITES_DIR, id, "clone.json");
  if (!existsSync(file)) throw new HttpError(404, `no cloned site ${id}; POST /sites {url} first`);
  return JSON.parse(readFileSync(file, "utf8"));
};
const siteView = (id: string, kit: CloneKit) => ({
  id,
  url: kit.url,
  version: kit.version,
  theme: kit.theme,
  clonedAt: statSync(join(SITES_DIR, id, "clone.json")).mtime.toISOString(),
  preview: `${PUBLIC_URL}/sites/${id}/preview`,
  parts: kit.parts.map(({ html, ...p }) => ({ ...p, bytes: html.length, preview: `${PUBLIC_URL}/sites/${id}/parts/${p.name}` })),
});

const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// A page showing cloned parts at real size, each on the ground the site paints behind it.
function partsPage(id: string, kit: CloneKit, parts: CloneKit["parts"]) {
  const figures = parts
    .map(
      (p) =>
        `<figure><figcaption>${esc(p.name)} · ${p.w}×${p.h}${p.title ? ` · ${esc(p.title)}` : ""}</figcaption><div class="ground" style="${esc(p.ground ?? "")}">${p.html}</div></figure>`,
    )
    .join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><base href="/sites/${id}/"><title>${esc(kit.url)} parts</title><style>${kit.fontCss}
body{margin:0;padding:40px;background:${kit.theme.bg};color:${kit.theme.ink};font-family:${kit.theme.body ?? "system-ui, sans-serif"};display:flex;flex-direction:column;gap:48px;align-items:center}
figure{margin:0;max-width:100%;overflow:auto}figcaption{font:13px system-ui,sans-serif;color:${kit.theme.muted};margin:0 0 8px}.ground{padding:24px;border-radius:12px}</style></head><body>${figures}</body></html>`;
}

// Files under a data folder, served by path; dot-directories (.harness) included.
function sendUnder(root: string, rel: string, res: Response) {
  const file = resolve(root, `.${rel.startsWith("/") ? rel : `/${rel}`}`);
  if (!isInside(root, file) || !existsSync(file) || !statSync(file).isFile()) throw new HttpError(404, `no file ${rel}`);
  res.sendFile(file, { dotfiles: "allow" });
}

const captureDirFor = (url: string) => join(QUICK_DIR, "_captures", siteIdFor(url));

// What each gate checks, for GET /gates.
const GATE_ABOUT: Record<string, string> = {
  entry: "The root index.html is the film: the deliverable every other step plays.",
  assets: "Every media reference resolves inside the project; nothing hotlinked; required brand assets used; no stretched images.",
  duration: "Duration inside the genre band and the brief's confirmed length.",
  motion: "Motion doctrine, statically: idle wobble, forbidden eases, slow single entries, over-long staggers.",
  determinism: "Every frame is a pure function of seek time: no unseeded random, wall clock, render-time network, or timer-driven motion.",
  density: "Text economics: words per second, longest text block, smallest type.",
  ledger: "The seam ledger (exit/entry vectors per cut) exists and matches the scenes.",
  lint: "hyperframes lint: the static half of check (undeclared fonts, tweens on clip elements, ...).",
  check: "hyperframes check in Chrome: runtime errors, layout overlap and overflow, motion, WCAG contrast.",
  seam: "Seam gate in Chrome: every ledger cut measured (exit still moving, entry mid-flight, direction, zero overlap).",
  snapshot: "Proof frames and a contact sheet: opening, scene midpoints, both sides of each cut, final hold.",
};

// ---------- routes ----------

export function mountApi(app: Express) {
  app.get("/openapi.json", (_req, res) => {
    res.json(openapi(PUBLIC_URL, !!API_KEY));
  });
  app.get("/docs", (_req, res) => {
    res.type("html").send(`<!doctype html><html><head><meta charset="utf-8"><title>hf-harness API</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui.css"></head>
<body style="margin:0"><div id="ui"></div>
<script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({ url: "/openapi.json", dom_id: "#ui", deepLinking: true, persistAuthorization: true });</script></body></html>`);
  });

  // ----- catalog of what the harness can do -----

  app.get("/gates", (_req, res) => {
    res.json(GATES.map((g) => ({ id: g.id, needsBrowser: g.needsBrowser, about: GATE_ABOUT[g.id] ?? "" })));
  });

  app.get("/templates", (_req, res) => {
    res.json(TEMPLATES.map((t) => ({ id: t.id, label: t.label, description: t.description, needs: t.needs })));
  });

  // Model providers as configured (keys never leave the server; only whether one is set).
  app.get("/providers", (_req, res) => {
    res.json(
      Object.values(providers()).map((p) => ({
        id: p.id,
        label: p.label,
        baseURL: p.baseURL,
        model: p.model,
        visionModel: p.visionModel,
        keySet: !!process.env[p.keyEnv]?.trim(),
        builder: checkProvider(p, "builder"),
        judge: checkProvider(p, "judge"),
      })),
    );
  });

  // ----- quick jobs (website trailers, launch films, template films) -----

  app.get("/quick", (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 50), 500);
    res.json(
      listQuick()
        .slice(0, limit)
        .map((q) => ({
          id: q.id,
          status: q.status,
          url: q.request.url,
          mode: q.request.mode ?? "templates",
          startedAt: q.startedAt,
          totalSec: q.totalSec ?? null,
          error: q.error ?? null,
          results: q.results.map((r) => ({ template: r.template, durationSec: r.durationSec ?? null, technical: r.technical ?? null, hardFail: r.hardFail ?? null, render: r.render?.status ?? null, error: r.error ?? null })),
          view: `${PUBLIC_URL}/quick-view/${q.id}`,
        })),
    );
  });

  app.delete("/quick/:id", (req, res) => {
    const q = getQuick(String(req.params.id));
    if (!q) throw new HttpError(404, `no quick job ${req.params.id}`);
    if (q.status === "running" || q.results.some((r) => r.render?.status === "rendering")) throw new HttpError(409, "the job is still working; delete it when it finishes");
    rmSync(quickDir(q.id), { recursive: true, force: true });
    res.json({ deleted: q.id });
  });

  // The rendered MP4 of one result, as a download.
  app.get("/quick/:id/download/:template", (req, res) => {
    const q = getQuick(String(req.params.id));
    const r = q?.results.find((x) => x.template === req.params.template);
    if (!q || !r) throw new HttpError(404, `no result ${req.params.template} in quick job ${req.params.id}`);
    if (r.render?.status !== "done" || !r.render.file) throw new HttpError(409, `not rendered yet (render: ${r.render?.status ?? "not started"}); POST /quick/${q.id}/render {template} first`);
    res.download(join(r.dir, r.render.file), `${q.id}-${r.template}.mp4`);
  });

  // ----- frames: still images of any project at chosen times -----

  // Body: { at: number[] (seconds), and either projectDir or quickId + template }.
  app.post(
    "/frames",
    asyncRoute(async (req, res) => {
      const { at, quickId, template, projectDir } = req.body ?? {};
      const times = (Array.isArray(at) ? at : String(at ?? "").split(",")).map(Number).filter((t) => Number.isFinite(t) && t >= 0);
      if (!times.length || times.length > 24) throw new HttpError(400, "at: 1 to 24 times in seconds, e.g. [1.5, 10, 22]");
      let dir: string;
      let base: string;
      if (quickId) {
        const r = getQuick(String(quickId))?.results.find((x) => x.template === template);
        if (!r) throw new HttpError(404, `no result ${template} in quick job ${quickId}`);
        dir = r.dir;
        base = `${PUBLIC_URL}/quick-play/${quickId}/${template}`;
      } else {
        dir = dataDir(projectDir);
        base = isInside(RUNS_DIR, dir) ? `${PUBLIC_URL}/files/${relative(RUNS_DIR, dir).split("\\").join("/")}` : "";
      }
      if (!existsSync(join(dir, "hyperframes.json"))) throw new HttpError(400, `not a HyperFrames project: ${dir}`);
      const name = `frames-${Date.now()}`;
      const out = join(dir, ".harness", name);
      const r = await runHf(["snapshot", "--at", times.join(","), "-o", out, "--describe", "false", "."], { cwd: dir, timeoutMs: 600_000 });
      const files = existsSync(out) ? readdirSync(out).sort() : [];
      if (r.code !== 0 || !files.length) throw new HttpError(500, `snapshot failed: ${(r.stderr || r.stdout).trim().split(/\r?\n/).slice(-3).join(" | ")}`);
      res.json({
        dir: out,
        frames: files.map((f) => ({ file: f, url: base ? `${base}/.harness/${name}/${f}` : null })),
      });
    }),
  );

  // ----- sites: a landing page cloned as code (the trailer's raw material) -----

  app.get("/sites", (_req, res) => {
    const ids = existsSync(SITES_DIR) ? readdirSync(SITES_DIR).filter((d) => existsSync(join(SITES_DIR, d, "clone.json"))) : [];
    res.json(
      ids.map((id) => {
        const kit = readKit(id);
        return { id, url: kit.url, version: kit.version, theme: kit.theme, parts: kit.parts.length, clonedAt: statSync(join(SITES_DIR, id, "clone.json")).mtime.toISOString(), preview: `${PUBLIC_URL}/sites/${id}/preview` };
      }),
    );
  });

  // Clone (or return the cached clone of) a landing page. Takes about a minute on a fresh site.
  app.post(
    "/sites",
    asyncRoute(async (req, res) => {
      const url = urlOf(req.body);
      const dir = siteDirFor(url);
      mkdirSync(dir, { recursive: true });
      if (req.body?.refresh) rmSync(join(dir, "clone.json"), { force: true });
      const kit = await ensureClone(dir, url);
      if (!kit) throw new HttpError(422, "could not read the site's landing page (it may block automated browsers)");
      res.status(201).json(siteView(siteIdFor(url), kit));
    }),
  );

  app.get("/sites/:site", (req, res) => {
    const id = siteId(req);
    res.json(siteView(id, readKit(id)));
  });

  app.delete("/sites/:site", (req, res) => {
    const id = siteId(req);
    if (!existsSync(join(SITES_DIR, id))) throw new HttpError(404, `no cloned site ${id}`);
    rmSync(join(SITES_DIR, id), { recursive: true, force: true });
    res.json({ deleted: id });
  });

  app.get("/sites/:site/preview", (req, res) => {
    const id = siteId(req);
    const kit = readKit(id);
    res.type("html").send(partsPage(id, kit, kit.parts));
  });

  // One part: an HTML preview, or ?format=json for the raw clone (html, size, ground, handles).
  app.get("/sites/:site/parts/:name", (req, res) => {
    const id = siteId(req);
    const kit = readKit(id);
    const part = kit.parts.find((p) => p.name === req.params.name);
    if (!part) throw new HttpError(404, `no part ${req.params.name}; parts: ${kit.parts.map((p) => p.name).join(", ")}`);
    if (req.query.format === "json") return res.json({ ...part, fontCss: kit.fontCss });
    res.type("html").send(partsPage(id, kit, [part]));
  });

  // Images, fonts and rasters a clone references (clone/<file>).
  app.use("/sites/:site/clone", (req, res) => {
    sendUnder(join(SITES_DIR, siteId(req), "clone"), decodeURIComponent(req.path), res);
  });

  // ----- page capture, brand kit, page structure (the templates/launch modes' inputs) -----

  // Capture a page with `hyperframes capture`: screenshots, page HTML, fonts, logos. Cached for a day.
  app.post(
    "/capture",
    asyncRoute(async (req, res) => {
      const url = urlOf(req.body);
      mkdirSync(QUICK_DIR, { recursive: true });
      const dir = await captureFor(url, captureDirFor(url));
      const shots = existsSync(join(dir, "screenshots")) ? readdirSync(join(dir, "screenshots")).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort() : [];
      const servable = isInside(join(QUICK_DIR, "_captures"), dir);
      const id = servable ? relative(join(QUICK_DIR, "_captures"), dir).split("\\").join("/") : null;
      res.json({
        id,
        dir,
        screenshots: shots.map((f) => ({ file: `screenshots/${f}`, url: id ? `${PUBLIC_URL}/captures/${id}/screenshots/${f}` : null })),
      });
    }),
  );

  app.use("/captures/:site", (req, res) => {
    sendUnder(join(QUICK_DIR, "_captures", siteId(req)), decodeURIComponent(req.path), res);
  });

  // The site's brand: real fonts (with substitutes when a face can't ship) and logos.
  app.post(
    "/brandkit",
    asyncRoute(async (req, res) => {
      const url = urlOf(req.body);
      mkdirSync(QUICK_DIR, { recursive: true });
      const dir = await captureFor(url, captureDirFor(url));
      res.json(await ensureBrandKit(dir, url));
    }),
  );

  // The page's structure as data: navbar, hero, features, pricing, CTAs (launch-film input).
  app.post(
    "/extract",
    asyncRoute(async (req, res) => {
      const url = urlOf(req.body);
      mkdirSync(QUICK_DIR, { recursive: true });
      const dir = await captureFor(url, captureDirFor(url));
      res.json(await ensureSiteParts(dir));
    }),
  );
}
