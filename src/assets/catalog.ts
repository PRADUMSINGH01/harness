// The asset library builders draw from: logos, photos, screenshots, illustrations, icons,
// textures, Lottie, video, audio, fonts, plus the creative kit (assets/creative: backgrounds,
// overlays, shapes, doodles, mockups, charts, titles, mattes, frames). Sources are folders on disk; each asset's metadata
// comes from its own file plus whatever sidecar describes it:
//   <name>.geo.json  per-asset sidecar (id, name, type, geometry, animation, tags)
//   <name>.asset.json per-asset sidecar written by harness uploads
//   index.json       per-folder catalog ({ items: [{ id, name, type, kind, src, tags, description, usage_css, animation }] })
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
import { HARNESS_ROOT } from "../config.ts";
import { readMeta, lottieMeta } from "./meta.ts";
import { isInside } from "../util.ts";

export const ASSET_KINDS = [
  "logo", "photo", "screenshot", "illustration", "icon", "texture", "lottie", "video", "audio", "font",
  // The creative kit: themeable SVG building blocks (assets/creative/README.md has the contract).
  "background", "overlay", "shape", "doodle", "mockup", "chart", "title", "matte", "frame",
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];
export const CREATIVE_KINDS: ReadonlySet<AssetKind> = new Set(["background", "overlay", "shape", "doodle", "mockup", "chart", "title", "matte", "frame"]);
const isKind = (k: unknown): k is AssetKind => typeof k === "string" && (ASSET_KINDS as readonly string[]).includes(k);

export interface Asset {
  id: string;
  name: string;
  kind: AssetKind;
  format: string;
  path: string;
  source: string;
  bytes: number;
  sha1: string;
  width?: number;
  height?: number;
  aspect?: number;
  transparent?: boolean;
  durationSec?: number;
  tags: string[];
  description?: string;
  brand?: string;
  license?: string;
  usage: { css?: string; entrance?: string; ease?: string; durationSec?: number; outlinePath?: string };
  aliases: string[];
}

const MEDIA_EXT: Record<string, AssetKind | "image" | "svg" | "maybe-lottie"> = {
  png: "image", jpg: "image", jpeg: "image", webp: "image", gif: "image",
  svg: "svg", json: "maybe-lottie",
  mp4: "video", webm: "video", mov: "video",
  mp3: "audio", wav: "audio", m4a: "audio", ogg: "audio",
  woff: "font", woff2: "font", ttf: "font", otf: "font",
};

// The harness is self-contained: its library lives in <harness>/assets and uploads land in
// <harness>/assets/custom. HARNESS_ASSET_DIRS (";" or "," separated, relative to the harness)
// can add folders, but they must sit inside the harness.
export const OWN_ASSETS = join(HARNESS_ROOT, "assets");
export function assetDirs(): string[] {
  const configured = process.env.HARNESS_ASSET_DIRS?.split(/[;,]/).map((s) => s.trim()).filter(Boolean) ?? [];
  const extra = configured.map((d) => resolve(HARNESS_ROOT, d)).filter((d) => isInside(HARNESS_ROOT, d));
  return [...new Set([OWN_ASSETS, ...extra])].filter((d) => existsSync(d));
}

let cache: { assets: Asset[]; byId: Map<string, Asset>; builtAt: number } | null = null;

export function catalog(): Asset[] {
  if (!cache) reindex();
  return cache!.assets;
}

export function getAsset(idOrAlias: string): Asset | undefined {
  if (!cache) reindex();
  return cache!.byId.get(idOrAlias) ?? cache!.assets.find((a) => a.aliases.includes(idOrAlias));
}

export function reindex(): { count: number; dirs: string[] } {
  const assets: Asset[] = [];
  const dirs = assetDirs();
  for (const root of dirs) scanDir(root, root, assets);
  // Ids are "<folder>/<file stem>"; disambiguate the rare collision between sources.
  const byId = new Map<string, Asset>();
  for (const a of assets) {
    let id = a.id;
    for (let n = 2; byId.has(id); n++) id = `${a.id}-${n}`;
    a.id = id;
    byId.set(id, a);
  }
  cache = { assets: assets.sort((x, y) => x.id.localeCompare(y.id)), byId, builtAt: Date.now() };
  return { count: assets.length, dirs };
}

function scanDir(root: string, dir: string, out: Asset[]) {
  const names = readdirSync(dir);
  const folderIndex = readFolderIndex(dir);
  for (const name of names) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (!name.startsWith(".") && name !== "node_modules") scanDir(root, p, out);
      continue;
    }
    if (/\.(geo|asset)\.json$/i.test(name) || name === "index.json" || name === "geo.json") continue;
    const ext = extname(name).slice(1).toLowerCase();
    const family = MEDIA_EXT[ext];
    if (!family) continue;
    if (family === "maybe-lottie") {
      const lm = lottieMeta(readFileSync(p, "utf8"));
      if (!lm) continue;
    }
    out.push(describe(root, p, ext, st.size, folderIndex));
  }
}

interface IndexItem {
  id?: string;
  name?: string;
  type?: string;
  src?: string;
  tags?: string[];
  description?: string;
  usage_css?: string;
  category?: string;
  kind?: string;
  license?: string;
  animation?: { recommended_entrance?: string; suggested_ease?: string; duration_seconds?: number };
}

function readFolderIndex(dir: string): Map<string, IndexItem> {
  const map = new Map<string, IndexItem>();
  for (const f of ["index.json", "geo.json"]) {
    const p = join(dir, f);
    if (!existsSync(p)) continue;
    try {
      const j = JSON.parse(readFileSync(p, "utf8"));
      const items: IndexItem[] = Array.isArray(j.items) ? j.items : j.asset?.src ? [{ ...j, src: j.asset.src, type: j.type }] : [];
      for (const it of items) if (it.src) map.set(basename(it.src).toLowerCase(), it);
    } catch {}
  }
  return map;
}

function readSidecar(path: string): any {
  const stem = path.slice(0, -extname(path).length);
  for (const s of [`${stem}.asset.json`, `${stem}.geo.json`]) {
    if (existsSync(s)) {
      try {
        return JSON.parse(readFileSync(s, "utf8"));
      } catch {}
    }
  }
  return null;
}

const words = (s: string) => s.replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();

function describe(root: string, path: string, ext: string, bytes: number, folderIndex: Map<string, IndexItem>): Asset {
  const rel = relative(root, path).split("\\").join("/");
  const folder = rel.includes("/") ? rel.split("/").slice(-2, -1)[0] : basename(root);
  const stem = basename(path, extname(path));
  const side = readSidecar(path);
  const item = folderIndex.get(basename(path).toLowerCase());
  const meta = readMeta(path, ext);
  const tags = [...new Set([...(side?.tags ?? []), ...(item?.tags ?? [])].map((t: string) => String(t).toLowerCase()))];
  const type = String(side?.type ?? item?.type ?? "").toLowerCase();
  const name = side?.name ?? item?.name ?? words(stem);
  const kind = isKind(side?.kind) ? side.kind : isKind(item?.kind) ? item.kind : inferKind(ext, folder, type, tags, `${stem} ${name}`, !!meta.lottie);
  const animation = side?.animation ?? item?.animation;
  const width = meta.width ?? side?.geometry?.bounds?.width;
  const height = meta.height ?? side?.geometry?.bounds?.height;
  const brand = side?.brand ?? (kind === "logo" ? brandFrom(stem) : undefined);
  return {
    id: `${folder}/${stem}`,
    name,
    kind,
    format: ext === "jpeg" ? "jpg" : ext,
    path,
    source: `${basename(root)}/${folder}`,
    bytes,
    sha1: createHash("sha1").update(readFileSync(path)).digest("hex").slice(0, 16),
    width,
    height,
    aspect: width && height ? Math.round((width / height) * 1000) / 1000 : undefined,
    transparent: meta.transparent,
    durationSec: meta.lottie?.seconds,
    tags,
    description: side?.description ?? item?.description,
    brand,
    license: side?.license ?? item?.license,
    usage: {
      css: item?.usage_css ?? side?.usage_css,
      entrance: animation?.recommended_entrance,
      ease: animation?.suggested_ease,
      durationSec: animation?.duration_seconds,
      outlinePath: side?.geometry?.closed_svg_path,
    },
    aliases: [side?.id, item?.id, stem].filter(Boolean),
  };
}

function inferKind(ext: string, folder: string, type: string, tags: string[], text: string, isLottie: boolean): AssetKind {
  const family = MEDIA_EXT[ext];
  if (isLottie) return "lottie";
  if (family === "video" || family === "audio" || family === "font") return family;
  const t = new Set(tags);
  const lower = text.toLowerCase();
  if (folder === "official" || folder === "logos" || t.has("logo") || t.has("wordmark") || /\blogo\b/.test(lower)) return "logo";
  if (type.includes("texture") || t.has("texture")) return "texture";
  if (t.has("icon") || folder === "icons") return "icon";
  if (family === "image") return t.has("screenshot") || t.has("ui") || /screenshot|\bui\b/.test(lower) ? "screenshot" : "photo";
  return "illustration";
}

function brandFrom(stem: string): string {
  return words(stem.replace(/[_-]?(official|logo|mark|wordmark|icon)([_-]|$)/gi, " ")).split(" ")[0]?.toLowerCase() || stem;
}

// ---------- search ----------

const tokenize = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1);

export function searchAssets(query: string, { kind, limit = 12 }: { kind?: string; limit?: number } = {}) {
  const q = tokenize(query);
  const scored = catalog()
    .filter((a) => !kind || a.kind === kind)
    .map((a) => {
      const fields: [string[], number][] = [
        [tokenize(a.name), 3],
        [a.tags.flatMap(tokenize), 3],
        [tokenize(a.brand ?? ""), 4],
        [tokenize(a.id), 2],
        [tokenize(a.description ?? ""), 1],
      ];
      let score = 0;
      for (const w of q) {
        let best = 0;
        for (const [toks, weight] of fields) if (toks.some((t) => t === w || (w.length > 3 && t.startsWith(w)))) best = Math.max(best, weight);
        score += best;
      }
      // The whole query as one phrase in the name or a tag beats the same words scattered.
      const phrase = q.join(" ");
      if (q.length > 1 && [a.name, ...a.tags].some((t) => tokenize(t).join(" ").includes(phrase))) score += 3;
      return { a, score };
    })
    .filter((x) => !q.length || x.score > 0)
    // Ties go to the more specific (shorter) name: "Film grain" over a scene whose caption mentions grain.
    .sort((x, y) => y.score - x.score || x.a.name.length - y.a.name.length || x.a.id.localeCompare(y.a.id));
  return scored.slice(0, limit).map((x) => ({ ...summary(x.a), score: x.score }));
}

export function summary(a: Asset) {
  return {
    id: a.id,
    name: a.name,
    kind: a.kind,
    format: a.format,
    width: a.width,
    height: a.height,
    aspect: a.aspect,
    transparent: a.transparent,
    durationSec: a.durationSec,
    brand: a.brand,
    tags: a.tags,
    description: a.description,
  };
}

// ---------- uploads ----------

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "asset";

export interface UploadInput {
  filename: string;
  dataBase64?: string;
  fromPath?: string;
  name?: string;
  kind?: AssetKind;
  tags?: string[];
  description?: string;
  brand?: string;
  license?: string;
}

export function addAsset(input: UploadInput): Asset {
  const ext = extname(input.filename).slice(1).toLowerCase();
  if (!MEDIA_EXT[ext]) throw Object.assign(new Error(`unsupported file type .${ext}`), { status: 400 });
  const data = input.dataBase64 ? Buffer.from(input.dataBase64, "base64") : input.fromPath ? readFileSync(input.fromPath) : null;
  if (!data?.length) throw Object.assign(new Error("give dataBase64 or fromPath"), { status: 400 });
  const dir = join(OWN_ASSETS, "custom");
  mkdirSync(dir, { recursive: true });
  let stem = slug(input.name ?? basename(input.filename, extname(input.filename)));
  for (let n = 2; existsSync(join(dir, `${stem}.${ext}`)); n++) stem = `${slug(input.name ?? stem)}-${n}`;
  const file = join(dir, `${stem}.${ext}`);
  writeFileSync(file, data);
  writeFileSync(
    join(dir, `${stem}.asset.json`),
    JSON.stringify(
      {
        name: input.name ?? words(stem),
        kind: input.kind,
        tags: input.tags ?? [],
        description: input.description,
        brand: input.brand,
        license: input.license,
        uploadedAt: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
  );
  if (!existsSync(OWN_ASSETS)) mkdirSync(OWN_ASSETS, { recursive: true });
  reindex();
  const added = getAsset(`custom/${stem}`);
  if (!added) throw new Error("uploaded asset was not indexed");
  return added;
}

// ---------- staging into a project ----------

export interface StagedAsset {
  id: string;
  name: string;
  kind: AssetKind;
  file: string; // project-relative path
  width?: number;
  height?: number;
  aspect?: number;
  transparent?: boolean;
  durationSec?: number;
  brand?: string;
  role?: string;
  required?: boolean;
  notes?: string;
  license?: string;
  usage?: Asset["usage"];
  description?: string;
  origin: string;
}

const MANIFEST = "assets/assets.json";

export function readStaged(projectDir: string): StagedAsset[] {
  const p = join(projectDir, MANIFEST);
  if (!existsSync(p)) return [];
  try {
    return JSON.parse(readFileSync(p, "utf8")).assets ?? [];
  } catch {
    return [];
  }
}

// Copy a library asset into the project (renders must be self-contained) and record it.
export function stageAsset(projectDir: string, asset: Asset, extra: { role?: string; required?: boolean; notes?: string } = {}): StagedAsset {
  const dir = join(projectDir, "assets", asset.kind);
  mkdirSync(dir, { recursive: true });
  const name = `${slug(asset.id.split("/").pop()!)}.${asset.format}`;
  const dest = join(dir, name);
  if (!existsSync(dest)) copyFileSync(asset.path, dest);
  return recordStaged(projectDir, {
    id: asset.id,
    name: asset.name,
    kind: asset.kind,
    file: relative(projectDir, dest).split("\\").join("/"),
    width: asset.width,
    height: asset.height,
    aspect: asset.aspect,
    transparent: asset.transparent,
    durationSec: asset.durationSec,
    brand: asset.brand,
    license: asset.license,
    usage: asset.usage,
    description: asset.description,
    origin: `library:${asset.source}`,
    ...extra,
  });
}

export function recordStaged(projectDir: string, entry: StagedAsset): StagedAsset {
  const all = readStaged(projectDir).filter((a) => a.file !== entry.file);
  all.push(entry);
  mkdirSync(join(projectDir, "assets"), { recursive: true });
  writeFileSync(join(projectDir, MANIFEST), JSON.stringify({ assets: all }, null, 2) + "\n");
  writeFileSync(join(projectDir, "assets", "ASSETS.md"), assetsMarkdown(all));
  return entry;
}

export function dims(a: { width?: number; height?: number; aspect?: number }) {
  return a.width && a.height ? `${Math.round(a.width)}×${Math.round(a.height)} (aspect ${a.aspect})` : "size unknown";
}

export function assetsMarkdown(all: StagedAsset[]): string {
  const rows = all
    .map((a) => `| \`${a.file}\` | ${a.kind}${a.brand ? ` (${a.brand})` : ""} | ${dims(a)}${a.transparent ? ", transparent" : ""}${a.durationSec ? `, ${a.durationSec}s` : ""} | ${a.role ?? ""} | ${a.required ? "**yes**" : ""} | ${a.name}${a.notes ? `. ${a.notes}` : ""} |`)
    .join("\n");
  return `# Project assets\n\nStaged by the harness. Paths are relative to the project root; reference them exactly. Usage rules per kind are in your worker packet.\n\n| File | Kind | Size | Role | Required | Notes |\n| --- | --- | --- | --- | --- | --- |\n${rows}\n`;
}
