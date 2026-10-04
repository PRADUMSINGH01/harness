// Asset hygiene: every media reference resolves to a file inside the project, nothing is
// hotlinked, required brand assets are used, and images aren't stretched or blown up.
import { existsSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { Finding, GateResult, Genre } from "../types.ts";
import type { Project, ProjectFile } from "../project.ts";
import { readStaged, type StagedAsset } from "../assets/catalog.ts";
import { lineAt } from "../util.ts";

export const id = "assets";
export const needsBrowser = false;

const MEDIA_TAG = /<(img|video|audio|source|image|use|object|embed|track|link)\b[^>]*>/gi;
const ATTR = /\s(src|href|xlink:href|poster|data)\s*=\s*["']([^"']+)["']/gi;
const CSS_URL = /url\(\s*['"]?([^'")]+?)['"]?\s*\)/gi;
const LOTTIE_PATH = /\b(path|src)\s*:\s*["']([^"']+\.(?:json|lottie))["']/gi;
// Remote stylesheets/fonts from Google Fonts are a HyperFrames-supported pattern; media is not.
const ALLOWED_REMOTE = /^(https?:)?\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//i;
const RASTER = /\.(png|jpe?g|webp|gif)$/i;

export interface Ref {
  file: ProjectFile;
  value: string;
  tag: string;
  index: number;
  rel?: string; // project-relative resolved path for local refs
}

export function collectRefs(project: Project): Ref[] {
  const refs: Ref[] = [];
  for (const file of project.files) {
    const html = file.html.replace(/<script\b[^>]*\bsrc=[^>]*>/gi, (m) => " ".repeat(m.length));
    for (const m of html.matchAll(MEDIA_TAG)) {
      const tag = m[1].toLowerCase();
      if (tag === "link" && !/rel\s*=\s*["'][^"']*(stylesheet|preload|icon)/i.test(m[0])) continue;
      for (const a of m[0].matchAll(ATTR)) refs.push({ file, value: a[2].trim(), tag, index: m.index! });
    }
    for (const m of html.matchAll(CSS_URL)) refs.push({ file, value: m[1].trim(), tag: "css", index: m.index! });
    for (const m of html.matchAll(LOTTIE_PATH)) refs.push({ file, value: m[2].trim(), tag: "lottie", index: m.index! });
  }
  for (const r of refs) {
    if (isLocal(r.value)) {
      const clean = r.value.split(/[?#]/)[0];
      const abs = resolveRef(project, r.file.path, clean);
      r.rel = relative(project.root, abs).split("\\").join("/");
    }
  }
  return refs;
}

const isRemote = (v: string) => /^(https?:)?\/\//i.test(v);
const isLocal = (v: string) => !isRemote(v) && !/^(data|blob|about|javascript):/i.test(v) && !v.startsWith("#") && !v.includes("${") && !v.includes("{{") && v !== "";

export function run(project: Project, _genre?: Genre): GateResult {
  const findings: Finding[] = [];
  const add = (f: Omit<Finding, "gate">) => findings.push({ gate: id, ...f });
  const refs = collectRefs(project);
  const staged = readStaged(project.root);
  const byFile = new Map(staged.map((s) => [s.file, s]));

  for (const r of refs) {
    const line = lineAt(r.file.html, r.index);
    if (isRemote(r.value)) {
      if (ALLOWED_REMOTE.test(r.value)) continue;
      add({
        severity: "error",
        code: "hotlinked-media",
        message: `<${r.tag}> loads ${r.value.slice(0, 120)} from the network. Renders are offline and parallel, so it may be missing, slow, or different per frame.`,
        fix: "Copy the file into the project (use_asset / fetch_logo, or the harness upload) and reference it locally.",
        file: r.file.rel,
        line,
      });
      continue;
    }
    if (!r.rel) continue;
    if (r.rel.startsWith("..") || isAbsolute(r.rel)) {
      add({ severity: "error", code: "outside-project", message: `${r.value} points outside the project.`, fix: "Copy it into assets/ and reference it relative to the project.", file: r.file.rel, line });
    } else if (!existsSync(join(project.root, r.rel))) {
      add({ severity: "error", code: "broken-asset", message: `${r.value} does not exist (resolved to ${r.rel}).`, fix: "Fix the path, or stage the asset into the project first.", file: r.file.rel, line });
    }
  }

  // Required assets must be used somewhere. Fall back to a filename match for assets wired up in JS.
  const allHtml = project.files.map((f) => f.html).join("\n");
  const used = new Set(refs.map((r) => r.rel).filter(Boolean));
  for (const a of staged.filter((s) => s.required)) {
    if (used.has(a.file) || allHtml.includes(a.file) || allHtml.includes(basename(a.file))) continue;
    add({
      severity: "error",
      code: "required-asset-unused",
      message: `Required ${a.kind} ${a.file} (${a.name}) is never used in the film.`,
      fix: `Place it where the brief asks${a.role ? ` (${a.role})` : ""}; see the usage rules for ${a.kind}s.`,
      file: "assets/ASSETS.md",
    });
  }

  for (const f of project.files) findings.push(...sizeFindings(project, f, byFile));
  return { status: "ran", findings, data: { references: refs.length, staged: staged.length, required: staged.filter((s) => s.required).length } };
}

// HyperFrames serves every composition, sub-compositions included, with the project root as its base
// URL, so a path inside compositions/*.html resolves from the root. File-relative stays as a fallback
// for older projects whose sub-compositions still use ../ paths.
function resolveRef(project: Project, filePath: string, clean: string): string {
  if (clean.startsWith("/")) return join(project.root, clean);
  const fromRoot = resolve(project.root, clean);
  const fromFile = resolve(dirname(filePath), clean);
  return dirname(filePath) !== project.root && existsSync(fromRoot) && !existsSync(fromFile) ? fromRoot : fromFile;
}

// Static sizing checks on <img> with explicit pixel sizes: distortion and upscaling.
function sizeFindings(project: Project, file: ProjectFile, byFile: Map<string, StagedAsset>): Finding[] {
  const out: Finding[] = [];
  for (const m of file.html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src = tag.match(/\ssrc\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!src || !isLocal(src)) continue;
    const rel = relative(project.root, resolveRef(project, file.path, src.split(/[?#]/)[0])).split("\\").join("/");
    const asset = byFile.get(rel);
    if (!asset?.width || !asset.height) continue;
    const style = tag.match(/\sstyle\s*=\s*["']([^"']*)["']/i)?.[1] ?? "";
    const px = (prop: string) => {
      const attr = tag.match(new RegExp(`\\s${prop}\\s*=\\s*["']?(\\d+(?:\\.\\d+)?)(?:px)?["']?(?=[\\s>/])`, "i"))?.[1];
      const css = style.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*(\\d+(?:\\.\\d+)?)px`, "i"))?.[1];
      return css ? Number(css) : attr ? Number(attr) : undefined;
    };
    const w = px("width");
    const h = px("height");
    const fitted = /object-fit\s*:\s*(contain|cover|scale-down)/i.test(style);
    const line = lineAt(file.html, m.index!);
    if (w && h && !fitted) {
      const off = Math.abs(w / h / (asset.width / asset.height) - 1);
      if (off > 0.03) {
        out.push({
          gate: id,
          severity: asset.kind === "logo" ? "error" : "warning",
          code: "distorted-asset",
          message: `${rel} is drawn ${w}×${h} but is ${asset.width}×${asset.height}: stretched ${Math.round(off * 100)}%.${asset.kind === "logo" ? " Logos are never distorted." : ""}`,
          fix: "Set one dimension and leave the other auto, or add object-fit: contain.",
          file: file.rel,
          line,
        });
      }
    }
    if (RASTER.test(rel) && w && w > asset.width * 1.5) {
      out.push({
        gate: id,
        severity: "warning",
        code: "upscaled-raster",
        message: `${rel} is ${asset.width}px wide but drawn at ${w}px (${(w / asset.width).toFixed(1)}×): it will look soft.`,
        fix: "Use a larger source, or show it smaller.",
        file: file.rel,
        line,
      });
    }
  }
  return out;
}
