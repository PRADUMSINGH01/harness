// Quick mode (option C): brief + URL -> one model call for copy and palette -> every fitting template
// compiled and gated in parallel. Minutes become seconds because no agent writes code.
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { HARNESS_ROOT } from "../config.ts";
import { runHf } from "../hf.ts";
import { runGates, GATES, type GateReport } from "../gates/index.ts";
import { getGenre } from "../genres.ts";
import { listRuns, runDir } from "../runs/store.ts";
import { ensureBrandKit, brandSlug } from "../runs/brandkit.ts";
import { streamChat } from "../llm/stream.ts";
import { clientFor, modelFor, provider, requestExtras } from "../llm/providers.ts";
import { parseJsonOut } from "../hf.ts";
import { OWN_ASSETS } from "../assets/catalog.ts";
import { readMeta } from "../assets/meta.ts";
import { BACKGROUNDS, type Aspect, type Palette, type QuickSpec } from "./kit.ts";
import { TEMPLATES, getTemplate } from "./library.ts";
import { ensureSiteParts, type SiteParts } from "../launch/extract.ts";
import { buildFilm } from "../launch/film.ts";
import { ensureClone } from "../launch/clone.ts";
import { buildTrailer } from "../launch/trailer.ts";
import { createHash } from "node:crypto";

export const QUICK_DIR = process.env.HF_HARNESS_QUICK ?? join(HARNESS_ROOT, "quick");
// Two Chrome checks at a time: four in parallel fight for the CPU and finish later than two.
const GATE_CONCURRENCY = Number(process.env.HARNESS_QUICK_GATE_CONCURRENCY ?? 2);

export interface QuickRequest {
  url: string;
  brief?: string;
  aspect?: Aspect;
  templates?: string[];
  // "templates" (default): one 10s film per template. "launch": one launch film (up to 60s) built
  // from the site's real navbar, hero, features, screenshot and pricing.
  // "trailer": the site's real components cloned as code and filmed as a website trailer (default
  // on the /launch page).
  mode?: "templates" | "launch" | "trailer";
  // Launch mode: which formats to make (default the request's aspect).
  aspects?: Aspect[];
  style?: Partial<QuickSpec["style"]>;
  provider?: string;
}

export interface QuickResult {
  template: string;
  dir: string;
  durationSec?: number;
  scenes?: { id: string; label: string; start: number; dur: number }[];
  render?: { status: "rendering" | "done" | "failed"; file?: string; seconds?: number; error?: string };
  technical?: number;
  hardFail?: boolean;
  errors?: number;
  warnings?: number;
  findings?: string[];
  error?: string;
}

export interface QuickState {
  id: string;
  status: "running" | "done" | "failed";
  request: QuickRequest;
  startedAt: string;
  phases: Record<string, number>; // seconds per phase
  totalSec?: number;
  spec?: Omit<QuickSpec, "style" | "aspect"> & { style?: QuickSpec["style"] };
  results: QuickResult[];
  error?: string;
}

const statePath = (id: string) => join(QUICK_DIR, id, "quick.json");
export const quickDir = (id: string) => join(QUICK_DIR, id);
// Cloned sites are cached per URL under quick/_sites and shared by every trailer of that site.
export const SITES_DIR = join(QUICK_DIR, "_sites");
export const siteIdFor = (url: string) => brandSlug(url) + "-" + createHash("sha1").update(url.trim().toLowerCase()).digest("hex").slice(0, 6);
export const siteDirFor = (url: string) => join(SITES_DIR, siteIdFor(url));
// Every quick job, newest first.
export function listQuick(): QuickState[] {
  if (!existsSync(QUICK_DIR)) return [];
  return readdirSync(QUICK_DIR)
    .filter((d) => !d.startsWith("_"))
    .map((d) => getQuick(d))
    .filter((q): q is QuickState => !!q)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}
export function getQuick(id: string): QuickState | null {
  try {
    return JSON.parse(readFileSync(statePath(id), "utf8"));
  } catch {
    return null;
  }
}
const save = (s: QuickState) => {
  mkdirSync(join(QUICK_DIR, s.id), { recursive: true });
  writeFileSync(statePath(s.id), JSON.stringify(s, null, 2));
};

export function startQuick(req: QuickRequest): QuickState {
  if (!req.url) throw Object.assign(new Error("quick mode needs a url"), { status: 400 });
  const id = `${new Date().toISOString().slice(0, 10)}-${brandSlug(req.url)}-${Math.random().toString(36).slice(2, 6)}`;
  const state: QuickState = { id, status: "running", request: req, startedAt: new Date().toISOString(), phases: {}, results: [] };
  save(state);
  void runQuick(state).catch((e) => {
    state.status = "failed";
    state.error = (e as Error).message;
    save(state);
  });
  return state;
}

async function timed<T>(state: QuickState, phase: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  try {
    return await fn();
  } finally {
    state.phases[phase] = Math.round((Date.now() - t0) / 100) / 10;
    save(state);
  }
}

async function runQuick(state: QuickState) {
  const t0 = Date.now();
  const req = state.request;
  const aspect: Aspect = req.aspect === "9:16" ? "9:16" : "16:9";
  if (req.mode === "trailer") return runTrailer(state, t0);
  const capture = await timed(state, "capture", () => captureFor(req.url, join(QUICK_DIR, state.id, "capture")));
  const kit = await timed(state, "brandKit", () => ensureBrandKit(capture, req.url));
  const launch = req.mode === "launch";
  // Reading the page's parts (Chrome) and writing the copy (model) are independent: run them together.
  const [copy, parts] = await Promise.all([
    timed(state, "copy", () => writeCopy(req, capture, req.provider ?? "zai")),
    launch ? timed(state, "extract", () => ensureSiteParts(capture)) : Promise.resolve(undefined),
  ]);

  const primary = kit.fonts.find((f) => f.source !== "substitute");
  const font = primary?.use ?? "Inter";
  const fontFiles = (primary?.files ?? []).map((f) => ({ ...f, src: join(capture, f.file), file: `assets/fonts/${f.file.split("/").pop()}` }));
  const logoEntry = kit.logos[0];
  const logo = logoEntry ? join(capture, logoEntry.path.replace(/^capture\//, "")) : undefined;
  const logoInline =
    logo && logoEntry?.currentColor && logo.endsWith(".svg")
      ? readFileSync(logo, "utf8").replace(/\s(width|height|size)="[^"]*"/g, "").replace(/\scolor="currentColor"/, "")
      : undefined;
  // The page top to bottom: the full-page capture, or (when the site was too tall for one) its
  // viewport-sized scroll shots in order. Real pixel sizes drive the scroll distance.
  const shotDir = join(capture, "screenshots");
  const fullPage = join(shotDir, "full-page.png");
  const shotFiles = existsSync(fullPage)
    ? [fullPage]
    : existsSync(shotDir)
      ? readdirSync(shotDir).filter((n) => /^scroll-\d+\.png$/i.test(n)).sort().slice(0, 4).map((n) => join(shotDir, n))
      : [];
  const shots = shotFiles.map((src) => ({ src, ...readMeta(src, "png") })).filter((s): s is { src: string; width: number; height: number } => !!s.width && !!s.height).map((s) => ({ src: s.src, w: s.width, h: s.height }));
  const shot = shots[0]?.src ?? fullPage;
  const base: Omit<QuickSpec, "style"> = {
    aspect,
    brand: { name: copy.brandName, url: req.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""), font, fontImport: kit.fontImport, logo: logo ? `assets/logo${extname(logo)}` : undefined, logoInline, fontFaces: fontFiles.map(({ src: _s, ...f }) => ({ ...f, family: font })) },
    palette: copy.palette,
    copy: copy.copy,
    media: { screenshot: shots.length ? "assets/screenshot.png" : undefined, shots: shots.map((s, i) => ({ file: `assets/shot-${i + 1}.png`, w: s.w, h: s.h })) },
  };
  state.spec = base;
  save(state);
  if (launch && parts) return finishLaunch(state, t0, base, parts, { logo, shot, fontFiles, shots: shots.map((s) => s.src) });

  const wanted = (req.templates?.length ? req.templates : TEMPLATES.map((t) => t.id)).map((id) => getTemplate(id)).filter((t) => !!t);
  const eligible = wanted.filter((t) => t.needs.every((n) => (n === "screenshot" ? !!base.media.screenshot : n === "stat" ? !!base.copy.stat : base.copy.features.length >= 3)));
  // Each template gets its own background and transition, so the set shows the range.
  const looks: QuickSpec["style"][] = [
    { background: "aurora-mesh", transition: "iris", grain: true },
    { background: "dot-grid", transition: "diagonal", grain: false },
    { background: "grainy-gradient", transition: "stripes", grain: false },
    { background: "spotlight", transition: "iris", grain: true },
  ];
  await timed(state, "compile", async () => {
    eligible.forEach((t, i) => {
      const dir = join(QUICK_DIR, state.id, t.id);
      const style = { ...looks[i % looks.length], ...(req.style ?? {}) };
      if (!BACKGROUNDS.includes(style.background)) style.background = "aurora-mesh";
      const spec: QuickSpec = { ...base, style };
      try {
        stageProject(dir, logo, base.media.screenshot ? shot : undefined, fontFiles);
        writeFileSync(join(dir, "index.html"), t.build(spec).html);
        state.results.push({ template: t.id, dir });
      } catch (e) {
        state.results.push({ template: t.id, dir, error: (e as Error).message });
      }
    });
  });

  // Template transitions are designed and verified once, so quick mode skips the per-transition and
  // per-frame sampling (about 10s per check) and keeps lint, runtime, layout and contrast.
  const mg = getGenre("motion-graphics");
  const genre = { ...mg, check: { ...mg.check, atTransitions: false, frameCheck: false } };
  const only = GATES.map((g) => g.id).filter((g) => g !== "seam");
  await timed(state, "gates", () =>
    pool(
      state.results.filter((r) => !r.error),
      GATE_CONCURRENCY,
      async (r) => {
        const report: GateReport = await runGates(r.dir, genre, { browser: true, only });
        r.technical = report.score.technical;
        r.hardFail = report.score.hardFail;
        r.errors = report.score.counts.errors;
        r.warnings = report.score.counts.warnings;
        r.findings = Object.values(report.gates)
          .flatMap((g) => g.findings)
          .map((f) => `${f.severity} ${f.gate}/${f.code}: ${f.message.slice(0, 160)}`);
        save(state);
      },
    ),
  );
  state.results.sort((a, b) => Number(!!a.hardFail) - Number(!!b.hardFail) || (b.technical ?? -1) - (a.technical ?? -1));
  state.totalSec = Math.round((Date.now() - t0) / 100) / 10;
  state.status = "done";
  save(state);
}

async function finishLaunch(
  state: QuickState,
  t0: number,
  base: Omit<QuickSpec, "style">,
  parts: SiteParts,
  files: { logo?: string; shot: string; fontFiles: { src: string; file: string }[]; shots: string[] },
) {
  const req = state.request;
  const aspects = (req.aspects?.length ? req.aspects : [base.aspect]).filter((a, i, all) => all.indexOf(a) === i);
  const style = { background: "aurora-mesh", grain: true, ...(req.style ?? {}) };
  if (!BACKGROUNDS.includes(style.background)) style.background = "aurora-mesh";
  await timed(state, "compile", async () => {
    for (const aspect of aspects) {
      const name = `launch-${aspect === "9:16" ? "vertical" : "landscape"}`;
      const dir = join(QUICK_DIR, state.id, name);
      try {
        stageProject(dir, files.logo, base.media.screenshot ? files.shot : undefined, files.fontFiles, files.shots);
        const film = buildFilm({ ...base, aspect, parts, style: { background: style.background, grain: style.grain } });
        for (const [rel, text] of Object.entries(film.files)) {
          mkdirSync(dirname(join(dir, rel)), { recursive: true });
          writeFileSync(join(dir, rel), text);
        }
        writeFileSync(join(dir, "ledger.json"), JSON.stringify(film.ledger, null, 2));
        state.results.push({ template: name, dir, durationSec: film.duration, scenes: film.scenes });
      } catch (e) {
        state.results.push({ template: name, dir, error: (e as Error).message });
      }
    }
  });
  // Launch films gate as product launches: one proof frame per scene, seams measured as advisory.
  const pl = getGenre("product-launch");
  await timed(state, "gates", () =>
    pool(
      state.results.filter((r) => !r.error),
      // One long film at a time: two Chrome checks of a 40s+ film compete and both slow down.
      1,
      async (r) => {
        const proofTimes = (r.scenes ?? []).map((s) => Math.round(((s.start + s.dur * 0.7) / (r.durationSec ?? 1)) * 1000) / 1000);
        // Seams are generated, not hand-authored, and were verified once; keep lint, runtime, layout, contrast.
        const genre = { ...pl, proofTimes, check: { ...pl.check, frameCheck: false, atTransitions: false, samples: Math.max(6, (r.scenes ?? []).length) } };
        const only = GATES.map((g) => g.id).filter((g) => g !== "seam");
        const report: GateReport = await runGates(r.dir, genre, { browser: true, only });
        r.technical = report.score.technical;
        r.hardFail = report.score.hardFail;
        r.errors = report.score.counts.errors;
        r.warnings = report.score.counts.warnings;
        r.findings = Object.values(report.gates)
          .flatMap((g) => g.findings)
          .map((f) => `${f.severity} ${f.gate}/${f.code}: ${f.message.slice(0, 160)}`);
        save(state);
      },
    ),
  );
  state.totalSec = Math.round((Date.now() - t0) / 100) / 10;
  state.status = "done";
  save(state);
}

// MP4 output: HyperFrames renders the gated composition (needs FFmpeg on PATH).
export async function renderQuick(id: string, template: string): Promise<QuickResult> {
  const state = getQuick(id);
  const r = state?.results.find((x) => x.template === template);
  if (!state || !r) throw Object.assign(new Error(`no result ${template} in quick job ${id}`), { status: 404 });
  if (r.hardFail) throw Object.assign(new Error(`${template} failed its gates; fix it before rendering`), { status: 409 });
  r.render = { status: "rendering" };
  save(state);
  const t0 = Date.now();
  const file = `renders/${template}.mp4`;
  void runHf(["render", ".", "-q", "high", "-o", file], { cwd: r.dir, timeoutMs: 1_800_000 }).then((res) => {
    const fresh = getQuick(id)!;
    const target = fresh.results.find((x) => x.template === template)!;
    const ok = res.code === 0 && existsSync(join(r.dir, file));
    target.render = ok
      ? { status: "done", file, seconds: Math.round((Date.now() - t0) / 1000) }
      : { status: "failed", error: (res.stderr || res.stdout).trim().split(/\r?\n/).slice(-3).join(" | ") };
    save(fresh);
  });
  return r;
}

// Trailer mode: clone the live site's components as code (cached per site), film them, gate them.
async function runTrailer(state: QuickState, t0: number) {
  const req = state.request;
  const siteDir = siteDirFor(req.url);
  mkdirSync(siteDir, { recursive: true });
  const kit = await timed(state, "clone", () => ensureClone(siteDir, req.url.trim()));
  if (!kit || !kit.parts.some((p) => p.name === "headline" || p.name === "hero")) throw new Error("could not read the site's landing page (it may block automated browsers)");
  const aspects = (req.aspects?.length ? req.aspects : [req.aspect === "9:16" ? "9:16" : "16:9"]).filter((a, i, all) => all.indexOf(a) === i) as Aspect[];
  await timed(state, "compile", async () => {
    for (const aspect of aspects) {
      const name = `trailer-${aspect === "9:16" ? "vertical" : "landscape"}`;
      const dir = join(QUICK_DIR, state.id, name);
      try {
        mkdirSync(dir, { recursive: true });
        cpSync(join(siteDir, "clone"), join(dir, "clone"), { recursive: true });
        const film = buildTrailer(kit, aspect);
        for (const [rel, text] of Object.entries(film.files)) {
          mkdirSync(dirname(join(dir, rel)), { recursive: true });
          writeFileSync(join(dir, rel), text);
        }
        writeFileSync(join(dir, "ledger.json"), JSON.stringify(film.ledger, null, 2));
        writeFileSync(join(dir, "hyperframes.json"), JSON.stringify({ paths: { blocks: "compositions", components: "compositions/components", assets: "assets" } }, null, 2));
        writeFileSync(join(dir, "meta.json"), JSON.stringify({ id: name, name, createdAt: new Date().toISOString() }, null, 2));
        state.results.push({ template: name, dir, durationSec: film.duration, scenes: film.scenes });
      } catch (e) {
        state.results.push({ template: name, dir, error: (e as Error).message });
      }
    }
  });
  // Gated as a product launch. The site's own UI is shown as the site renders it, so authored-copy
  // rules (density) don't apply to it; lint, runtime, layout, contrast, motion and proofs do.
  const pl = getGenre("product-launch");
  await timed(state, "gates", () =>
    pool(
      state.results.filter((r) => !r.error),
      1,
      async (r) => {
        const proofTimes = (r.scenes ?? []).map((s) => Math.round(((s.start + s.dur * 0.7) / (r.durationSec ?? 1)) * 1000) / 1000);
        const genre = { ...pl, proofTimes, check: { ...pl.check, frameCheck: false, atTransitions: false, samples: Math.max(6, (r.scenes ?? []).length) } };
        const only = GATES.map((g) => g.id).filter((g) => g !== "seam" && g !== "density");
        const report: GateReport = await runGates(r.dir, genre, { browser: true, only });
        r.technical = report.score.technical;
        r.hardFail = report.score.hardFail;
        r.errors = report.score.counts.errors;
        r.warnings = report.score.counts.warnings;
        r.findings = Object.values(report.gates)
          .flatMap((g) => g.findings)
          .map((f) => `${f.severity} ${f.gate}/${f.code}: ${f.message.slice(0, 160)}`);
        save(state);
      },
    ),
  );
  state.totalSec = Math.round((Date.now() - t0) / 100) / 10;
  state.status = "done";
  save(state);
}

async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(n, queue.length) }, async () => {
    for (let item = queue.shift(); item; item = queue.shift()) await fn(item);
  }));
}

function stageProject(dir: string, logo: string | undefined, shot: string | undefined, fonts: { src: string; file: string }[] = [], shots: string[] = []) {
  mkdirSync(join(dir, "assets"), { recursive: true });
  writeFileSync(join(dir, "hyperframes.json"), JSON.stringify({ $schema: "https://hyperframes.heygen.com/schema/hyperframes.json", paths: { blocks: "compositions", components: "compositions/components", assets: "assets" }, authoringSkill: "motion-graphics" }, null, 2));
  writeFileSync(join(dir, "meta.json"), JSON.stringify({ id: dir.split(/[\\/]/).pop(), name: dir.split(/[\\/]/).pop(), createdAt: new Date().toISOString() }, null, 2));
  if (logo) copyFileSync(logo, join(dir, "assets", `logo${extname(logo)}`));
  if (shot) copyFileSync(shot, join(dir, "assets", "screenshot.png"));
  shots.forEach((src, i) => copyFileSync(src, join(dir, "assets", `shot-${i + 1}.png`)));
  if (fonts.length) mkdirSync(join(dir, "assets", "fonts"), { recursive: true });
  for (const f of fonts) if (existsSync(f.src)) copyFileSync(f.src, join(dir, f.file));
}

// A capture of the same site from the last day is reused (runs or earlier quick jobs).
export async function captureFor(url: string, target: string): Promise<string> {
  const norm = (u: string) => u.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");
  const fresh = (dir: string) => existsSync(join(dir, "screenshots")) && Date.now() - statSync(join(dir, "screenshots")).mtimeMs < 24 * 3_600_000;
  for (const r of listRuns()) {
    const dir = join(runDir(r.id), "shared", "capture");
    if (r.brief.url && norm(r.brief.url) === norm(url) && fresh(dir)) return dir;
  }
  if (existsSync(QUICK_DIR)) {
    for (const id of readdirSync(QUICK_DIR)) {
      const q = getQuick(id);
      const dir = join(QUICK_DIR, id, "capture");
      if (q && norm(q.request.url) === norm(url) && fresh(dir)) return dir;
    }
  }
  const r = await runHf(["capture", url, "-o", target, "--json"], { cwd: QUICK_DIR, timeoutMs: 600_000 });
  if (r.code !== 0 || !existsSync(join(target, "screenshots"))) throw new Error(`capture failed: ${(r.stderr || r.stdout).trim().split(/\r?\n/).slice(-2).join(" | ")}`);
  return target;
}

const ICONS = existsSync(join(OWN_ASSETS, "creative", "icons"))
  ? readdirSync(join(OWN_ASSETS, "creative", "icons")).filter((f) => f.endsWith(".svg")).map((f) => f.replace(/\.svg$/, ""))
  : ["sparkles"];
const HEX = /^#[0-9a-f]{6}$/i;

// A stat is a quantity (percent, multiplier, count, money, time), never an ID, version or date.
export function isQuantity(stat: { prefix?: string; suffix?: string; value?: unknown }): boolean {
  const prefix = String(stat.prefix ?? "").trim();
  const suffix = String(stat.suffix ?? "").trim();
  const v = Number(stat.value);
  return (
    /^(|[$€£₹¥]|US\$)$/.test(prefix) &&
    /^(|%|[xX×]|\+|[kKMB]\+?|ms|s|sec|min|h|hrs|hours|days|fps|\/mo|\/month)$/.test(suffix) &&
    !(Number.isInteger(v) && v >= 1900 && v <= 2100 && !prefix && !suffix)
  );
}

export function numberAppears(value: number, source: string): boolean {
  const forms = new Set([String(value), value.toLocaleString("en-US"), value.toLocaleString("en-US", { maximumFractionDigits: 2 })]);
  return [...forms].some((form) => new RegExp(`(^|[^0-9.,])${form.replace(/[.,]/g, (m) => `\\${m}`)}(?![0-9])`).test(source));
}

// One model call: the copy for every template slot, and a palette chosen from the site's own colors.
async function writeCopy(req: QuickRequest, capture: string, providerId: string): Promise<{ brandName: string; palette: Palette; copy: QuickSpec["copy"] }> {
  const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
  const tokens = JSON.parse(read(join(capture, "extracted", "tokens.json")) || "{}");
  const text = read(join(capture, "extracted", "visible-text.txt")).slice(0, 3500);
  const colors: string[] = (tokens.colors ?? []).filter((c: string) => HEX.test(c)).slice(0, 20);
  const prompt = `You write on-screen copy for a 10-second brand motion graphic. Return ONLY a JSON object.

Site: ${req.url}
Title: ${tokens.title ?? ""}
Description: ${tokens.description ?? ""}
${req.brief ? `Brief from the user: ${req.brief}\n` : ""}Visible page text:
${text}

Site colors (most used first): ${colors.join(", ")}
Icon ids: ${ICONS.join(", ")}

JSON shape:
{
  "brandName": "the product name as written on the site",
  "palette": { "bg": "#hex", "surface": "#hex", "ink": "#hex", "muted": "#hex", "accent": "#hex", "accent2": "#hex" },
  "copy": {
    "kicker": "2 words, a category or tagline",
    "headline": "3-5 words, the core promise, with exactly one *emphasis* word in asterisks",
    "subline": "3-5 words that support the headline",
    "features": [ { "title": "1-2 words", "icon": "icon id" }, { ... }, { ... } ],
    "stat": { "value": 98, "prefix": "", "suffix": "%", "label": "2-4 words" } or null,
    "callout": "2-3 words naming what the product screen shows",
    "cta": "2-3 words"
  }
}

Rules:
- Every claim comes from the page text or the brief. Never invent features, numbers, prices, or customers.
- stat: only a quantity (a percent, multiplier, count, money amount or duration) that literally appears in the page text or brief. Never an ID, version, ticket number, year, phone number or date. Otherwise null.
- palette: pick from the site colors. bg is the site's dominant ground, surface a slightly lifted panel tone, ink the main text color with strong contrast on bg, muted a secondary text color that still reads on bg, accent the brand's highlight color, accent2 a second brand color.
- Short and punchy: the whole film shows at most 22 words, so respect every word limit. Icons must be ids from the list.`;
  const p = provider(providerId);
  const res = await streamChat(clientFor(p), { model: modelFor(p, "builder")!, messages: [{ role: "user", content: prompt }], ...requestExtras(p) });
  const json = parseJsonOut(res.content);
  if (!json?.copy) throw new Error(`copy model returned no JSON: ${res.content.slice(0, 200)}`);
  const pal = json.palette ?? {};
  const pick = (k: keyof Palette, fallback: string) => (HEX.test(pal[k] ?? "") ? pal[k] : fallback);
  const c = json.copy;
  const features = (Array.isArray(c.features) ? c.features : []).filter((f: any) => f?.title).slice(0, 3).map((f: any) => ({ title: String(f.title), icon: ICONS.includes(f.icon) ? f.icon : "sparkles" }));
  const value = Number(c.stat?.value);
  const source = `${text}\n${req.brief ?? ""}\n${tokens.title ?? ""}\n${tokens.description ?? ""}`;
  // A number on screen is a claim: keep it only if it literally appears in the site text or brief.
  const stat =
    c.stat && Number.isFinite(value) && numberAppears(value, source) && isQuantity(c.stat)
      ? { value, prefix: c.stat.prefix ?? "", suffix: c.stat.suffix ?? "", label: String(c.stat.label ?? "") }
      : undefined;
  return {
    brandName: String(json.brandName ?? brandSlug(req.url)),
    palette: {
      bg: pick("bg", colors[0] ?? "#111216"),
      surface: pick("surface", "#1E2027"),
      ink: pick("ink", "#F5F3EE"),
      muted: pick("muted", "#A0A4AC"),
      accent: pick("accent", colors[1] ?? "#FF5A36"),
      accent2: pick("accent2", colors[2] ?? "#7B61FF"),
    },
    copy: {
      kicker: String(c.kicker ?? ""),
      headline: String(c.headline ?? ""),
      subline: String(c.subline ?? ""),
      features,
      stat,
      callout: String(c.callout ?? ""),
      cta: String(c.cta ?? "Get started"),
    },
  };
}
