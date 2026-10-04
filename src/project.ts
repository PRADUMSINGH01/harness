// Loads a HyperFrames project into one context object every gate reads from.
import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseFrontmatter, walk } from "./util.ts";
import { parseJsonOut, runHf } from "./hf.ts";

const SKIP_DIRS = ["node_modules", ".hyperframes", ".harness", "snapshots", "renders", "capture", ".media", ".git"];
const NOT_COMPOSITIONS = /storyboard\.html$|caption-skin\.html$/i;

export interface ProjectFile {
  path: string;
  rel: string;
  html: string;
}

export interface Project {
  root: string;
  files: ProjectFile[];
  index?: ProjectFile;
  canvas: { width: number; height: number };
  brief: Record<string, string>;
  briefText: string | null;
  storyboard: Record<string, string>;
  storyboardText: string | null;
  ledger: any;
  ledgerError: string | null;
  hasCaptions: boolean;
  sceneFiles: ProjectFile[];
  timeline: any;
}

export function loadProject(dir: string): Project {
  const root = resolve(dir);
  if (!existsSync(join(root, "hyperframes.json"))) throw new Error(`not a HyperFrames project (no hyperframes.json): ${root}`);
  const files = walk(root, { skip: SKIP_DIRS, ext: [".html"] })
    .filter((p) => !NOT_COMPOSITIONS.test(p))
    .map((path) => ({ path, rel: relative(root, path).split("\\").join("/"), html: readFileSync(path, "utf8") }));
  const read = (name: string) => (existsSync(join(root, name)) ? readFileSync(join(root, name), "utf8") : null);
  const briefText = read("BRIEF.md");
  const storyboardText = read("STORYBOARD.md");
  let ledger = null;
  let ledgerError: string | null = null;
  const ledgerText = read("ledger.json");
  if (ledgerText != null) {
    try {
      ledger = JSON.parse(ledgerText);
    } catch (e) {
      ledgerError = (e as Error).message;
    }
  }
  const index = files.find((f) => f.rel === "index.html");
  return {
    root,
    files,
    index,
    canvas: canvasOf(index?.html),
    brief: parseFrontmatter(briefText).data,
    briefText,
    storyboard: parseFrontmatter(storyboardText).data,
    storyboardText,
    ledger,
    ledgerError,
    hasCaptions: existsSync(join(root, "caption_groups.json")) || existsSync(join(root, "captions.json")),
    sceneFiles: files.filter((f) => f.rel.startsWith("compositions/")),
    timeline: undefined,
  };
}

function canvasOf(html?: string) {
  const w = html?.match(/data-width="(\d+)"/);
  const h = html?.match(/data-height="(\d+)"/);
  return { width: w ? Number(w[1]) : 1920, height: h ? Number(h[1]) : 1080 };
}

// `hyperframes timeline --json` is the source of truth for duration and clip layout.
// Load it once per gate pass; gates then read it synchronously.
export async function loadTimeline(project: Project) {
  if (project.timeline !== undefined) return project.timeline;
  const r = await runHf(["timeline", "--json"], { cwd: project.root, timeoutMs: 180_000 });
  project.timeline = parseJsonOut(r.stdout)?.timeline ?? null;
  if (!project.timeline) {
    const html = project.index?.html ?? "";
    const root = html.match(/<[^>]*data-composition-id="[^"]+"[^>]*>/)?.[0] ?? "";
    const d = root.match(/data-duration="([\d.]+)"/);
    project.timeline = d ? { duration: Number(d[1]), tracks: [], fallback: true } : null;
  }
  return project.timeline;
}

export function durationOf(project: Project): number | null {
  return project.timeline?.duration ?? null;
}

// Inline <script> bodies (external src scripts are libraries, not authored motion).
export function inlineScripts(html: string) {
  const out: { code: string; offset: number }[] = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/.test(m[1])) continue;
    if (/type\s*=\s*["'](application\/(ld\+)?json|text\/template)["']/i.test(m[1])) continue;
    out.push({ code: m[2], offset: m.index! + m[0].indexOf(m[2]) });
  }
  return out;
}

export function styleBlocks(html: string) {
  const out: { code: string; offset: number }[] = [];
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) out.push({ code: m[1], offset: m.index! + m[0].indexOf(m[1]) });
  for (const m of html.matchAll(/\sstyle\s*=\s*"([^"]*)"/gi)) out.push({ code: m[1], offset: m.index! });
  return out;
}

// Blank out comments while keeping offsets stable, so line numbers still point at the source.
export function stripComments(code: string) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:\\])\/\/[^\n]*/g, (m, p) => p + " ".repeat(m.length - p.length));
}
