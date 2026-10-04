// Asset operations builders call while they work: as tools in the harness's own agent loop
// (GLM, Gemini, ...) and as HTTP endpoints for Claude Agent SDK / external builders.
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import type OpenAI from "openai";
import { parseJsonOut, runHf } from "../hf.ts";
import { ASSET_KINDS, type AssetKind, CREATIVE_KINDS, dims, getAsset, recordStaged, searchAssets, stageAsset, type StagedAsset } from "./catalog.ts";
import { readMeta } from "./meta.ts";

// A paste-ready starting point for each kind, so the builder places the asset correctly first time.
export function snippet(a: StagedAsset): string {
  const ratio = a.aspect ? ` /* aspect ${a.aspect}: size one dimension only */` : "";
  switch (a.kind) {
    case "logo":
      return `<img src="${a.file}" alt="${a.brand ?? a.name}" style="height:96px;width:auto">  <!-- never recolor, crop, or redraw; keep clear space -->`;
    case "photo":
    case "screenshot":
      return `<div class="clip" data-start="0" data-duration="4" style="position:absolute;inset:0;overflow:hidden"><div class="cam"><img src="${a.file}" style="width:100%;height:100%;object-fit:cover;object-position:50% 50%"></div></div>  <!-- move .cam, not the clip -->`;
    case "texture":
      return `background-image:url('${a.file}'); background-size: 400px 400px;`;
    case "lottie":
      return `lottie.loadAnimation({ container: el, renderer: "svg", loop: false, autoplay: false, path: "${a.file}" }) then push it onto window.__hfLottie (native length ${a.durationSec ?? "?"}s)`;
    case "video":
      return `<video class="clip" data-start="0" src="${a.file}" muted></video>`;
    case "audio":
      return `<audio data-start="0" src="${a.file}"></audio>`;
    case "font":
      return `@font-face { font-family: "Brand"; src: url("${a.file}"); }`;
    case "background":
      return `<img src="${a.file}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">  <!-- bottom layer; inline the SVG instead to recolor it with the brand palette -->`;
    case "overlay":
      return `<img src="${a.file}" alt="" style="${a.usage?.css ?? "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;mix-blend-mode:screen"}">  <!-- top layer, over the finished scene -->`;
    case "matte":
      return `inline the SVG in a full-frame wrapper above both scenes, set --accent to a brand color, and sweep/scale its parts across the cut (see its description); or use it as mask-image: url("${a.file}")`;
    default:
      return `<img src="${a.file}" alt="${a.name}" style="width:320px;height:auto">${ratio}`;
  }
}

// Creative-kit SVGs are meant to be inlined (to take the brand palette and animate their parts), so
// small ones come back with their markup: no extra read_file turn.
const INLINE_MAX_BYTES = 12_000;

export function useAsset(projectDir: string, id: string, extra: { role?: string; required?: boolean; notes?: string } = {}) {
  const asset = getAsset(id);
  if (!asset) throw Object.assign(new Error(`no asset "${id}" in the library; search first`), { status: 404 });
  const staged = stageAsset(projectDir, asset, extra);
  const creative = CREATIVE_KINDS.has(staged.kind) || (staged.kind === "icon" && asset.path.includes("creative"));
  const inline =
    creative && asset.format === "svg" && asset.bytes <= INLINE_MAX_BYTES
      ? {
          inline: readFileSync(join(projectDir, staged.file), "utf8").trim(),
          inlineHint: "Paste this <svg> into the scene (size it with CSS width/height), set --accent/--ink/--surface/--font on an ancestor to apply the brand palette, and animate the parts named in the description. Draw-on paths (.draw): tween stroke-dashoffset 1.02 -> 0.",
        }
      : {};
  return { ...staged, snippet: snippet(staged), ...inline };
}

// Official brand marks via media-use (theSVG → GitHub avatar → favicon). Never drawn by hand.
export async function fetchLogo(projectDir: string, brand: string, extra: { role?: string; required?: boolean; notes?: string } = {}) {
  const r = await runHf(["media-use", "resolve", "--type", "logo", "--entity", brand, "--intent", `${brand} logo`, "--project", ".", "--json"], {
    cwd: projectDir,
    timeoutMs: 180_000,
  });
  const json = parseJsonOut(r.stdout);
  if (!json?.ok || !json.path) {
    throw Object.assign(new Error(`could not fetch the official ${brand} logo: ${(r.stderr || r.stdout).trim().split(/\r?\n/).slice(-2).join(" | ")}`), { status: 502 });
  }
  const src = join(projectDir, json.path);
  const ext = extname(src).slice(1).toLowerCase();
  const dir = join(projectDir, "assets", "logo");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${brand.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-logo.${ext}`);
  if (!existsSync(file)) copyFileSync(src, file);
  const meta = readMeta(file, ext);
  const staged = recordStaged(projectDir, {
    id: `media-use/${json.id}`,
    name: `${brand} official logo`,
    kind: "logo",
    file: `assets/logo/${file.split(/[\\/]/).pop()}`,
    width: meta.width,
    height: meta.height,
    aspect: meta.width && meta.height ? Math.round((meta.width / meta.height) * 1000) / 1000 : undefined,
    transparent: meta.transparent,
    brand,
    license: json.provenance?.license,
    origin: `media-use:${json.provenance?.provider ?? "logo"}`,
    description: json.description,
    ...extra,
  });
  return { ...staged, variants: json.provenance?.variants, snippet: snippet(staged) };
}

// Copy a file the user supplied by path straight into the project.
export function stageLocalFile(projectDir: string, path: string, kind: AssetKind, extra: { role?: string; required?: boolean; notes?: string; name?: string; brand?: string } = {}) {
  const ext = extname(path).slice(1).toLowerCase();
  const dir = join(projectDir, "assets", kind);
  mkdirSync(dir, { recursive: true });
  const base = path.split(/[\\/]/).pop()!.toLowerCase().replace(/[^a-z0-9.]+/g, "-");
  const dest = join(dir, base);
  copyFileSync(path, dest);
  const meta = readMeta(dest, ext);
  return recordStaged(projectDir, {
    id: `file/${base}`,
    name: extra.name ?? base,
    kind,
    file: `assets/${kind}/${base}`,
    width: meta.width,
    height: meta.height,
    aspect: meta.width && meta.height ? Math.round((meta.width / meta.height) * 1000) / 1000 : undefined,
    transparent: meta.transparent,
    durationSec: meta.lottie?.seconds,
    origin: "user file",
    role: extra.role,
    required: extra.required,
    notes: extra.notes,
    brand: extra.brand,
  });
}

// ---------- tool definitions for the harness agent loop ----------

export interface ExtraTool {
  tool: OpenAI.Chat.Completions.ChatCompletionTool;
  run: (args: any) => Promise<string> | string;
}

const fn = (name: string, description: string, properties: Record<string, unknown>, required: string[]): OpenAI.Chat.Completions.ChatCompletionTool => ({
  type: "function",
  function: { name, description, parameters: { type: "object", properties, required, additionalProperties: false } },
});

export function assetTools(projectDir: string): ExtraTool[] {
  return [
    {
      tool: fn(
        "search_assets",
        "Search the asset library: logos, photos, screenshots, illustrations, icons, textures, lottie, video, audio, fonts, and the creative kit (backgrounds, overlays like grain and light leaks, shapes, hand-drawn doodles, UI mockups and device frames, charts, titles and lower thirds, transition mattes, frames). Returns ids with kind, size, tags and description.",
        {
          query: { type: "string", description: "what you need, e.g. 'stripe logo', 'underline doodle', 'film grain', 'lower third', 'browser window', 'bar chart', 'brush wipe'" },
          kind: { type: "string", enum: [...ASSET_KINDS] },
          limit: { type: "integer", description: "default 8" },
        },
        ["query"],
      ),
      run: ({ query, kind, limit }) => {
        const hits = searchAssets(String(query ?? ""), { kind, limit: Math.min(Number(limit ?? 8), 25) });
        if (!hits.length) return `no assets match "${query}"${kind ? ` (kind ${kind})` : ""}. For a brand's logo use fetch_logo.`;
        return hits.map((h) => `${h.id} [${h.kind}] ${dims(h)}${h.transparent ? " transparent" : ""}${h.brand ? ` brand=${h.brand}` : ""} tags=${h.tags.slice(0, 6).join(",")} :: ${h.name}${h.description ? `. ${h.description.slice(0, 140)}` : ""}`).join("\n");
      },
    },
    {
      tool: fn(
        "use_asset",
        "Copy a library asset into this project's assets/ folder and record it in assets/ASSETS.md. Returns its project path, size, description (named parts, how to animate it), a placement snippet, and for creative-kit SVGs the inline markup.",
        { id: { type: "string" }, role: { type: "string", description: "what it is for in this film, e.g. 'end-card logo'" } },
        ["id"],
      ),
      run: ({ id, role }) => JSON.stringify(useAsset(projectDir, String(id), { role })),
    },
    {
      tool: fn(
        "fetch_logo",
        "Fetch a brand's official logo (never draw one) into assets/logo/ via media-use. Returns its path, size, license, and available variants.",
        { brand: { type: "string", description: "brand or domain, e.g. 'notion', 'github'" }, role: { type: "string" } },
        ["brand"],
      ),
      run: async ({ brand, role }) => JSON.stringify(await fetchLogo(projectDir, String(brand), { role })),
    },
  ];
}
