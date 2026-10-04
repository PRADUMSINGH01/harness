// Brand kit: the captured site's fonts and logo, resolved once per run by the harness.
// Without it every builder rediscovers them on its own: an undeclared brand font hard-fails
// HyperFrames lint, and a logo the capture missed sends builders cropping screenshots.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HF_ROOT } from "../config.ts";
import { readMeta } from "../assets/meta.ts";
import { readJson, writeJson } from "../util.ts";

export interface BrandFont {
  family: string;
  // captured: a .woff2 in capture/assets/fonts; auto: HyperFrames supplies it at render;
  // google: load it with the kit's @import; substitute: unavailable, use `use` instead.
  source: "captured" | "auto" | "google" | "substitute";
  use: string;
  // Captured font files (capture-relative), declared with @font-face by whoever uses the family.
  files?: { file: string; weight: string; style: string }[];
}

export interface BrandKit {
  fonts: BrandFont[];
  fontImport?: string;
  logos: { path: string; width?: number; height?: number; from: string; currentColor?: boolean }[];
  version?: number;
}

// Bump when the kit gains fields, so kits cached next to older captures are rebuilt.
const KIT_VERSION = 2;

const KIT_FILE = "brand-kit.json";
const FETCH_TIMEOUT_MS = 10_000;

export function readBrandKit(captureDir: string): BrandKit | null {
  return readJson(join(captureDir, KIT_FILE), null);
}

export async function ensureBrandKit(captureDir: string, siteUrl: string): Promise<BrandKit> {
  const existing = readBrandKit(captureDir);
  if (existing && existing.version === KIT_VERSION) return existing;
  const [fonts, logos] = await Promise.all([resolveFonts(captureDir), resolveLogos(captureDir, siteUrl)]);
  const google = fonts.filter((f) => f.source === "google");
  const kit: BrandKit = {
    fonts: fonts.map(({ query: _q, ...f }) => f),
    fontImport: google.length ? `https://fonts.googleapis.com/css2?${google.map((f) => `family=${f.query}`).join("&")}&display=block` : undefined,
    logos,
    version: KIT_VERSION,
  };
  writeJson(join(captureDir, KIT_FILE), kit);
  return kit;
}

// Font families HyperFrames resolves by itself, read from the vendored parser so it never drifts.
let autoFonts: Set<string> | undefined;
function autoResolvedFonts(): Set<string> {
  if (autoFonts) return autoFonts;
  autoFonts = new Set();
  try {
    const src = readFileSync(join(HF_ROOT, "packages", "parsers", "src", "fontAliases.ts"), "utf8");
    const map = src.slice(src.indexOf("FONT_ALIAS_MAP"), src.indexOf("} satisfies"));
    for (const m of map.matchAll(/^\s+(?:"([^"]+)"|([a-z][\w]*))\s*:\s*"/gm)) autoFonts.add((m[1] ?? m[2]).toLowerCase());
  } catch {}
  return autoFonts;
}

async function resolveFonts(captureDir: string): Promise<(BrandFont & { query?: string })[]> {
  const tokens = readJson(join(captureDir, "extracted", "tokens.json"), {} as any);
  const families: { family: string; weights?: number[] }[] = (tokens.fonts ?? []).filter((f: any) => typeof f?.family === "string").slice(0, 6);
  const manifest = readJson(join(captureDir, "extracted", "fonts-manifest.json"), {} as any);
  const captured = new Set<string>(
    [...(manifest.families ?? []), ...(manifest.files ?? [])].map((f: any) => String(f?.family ?? f?.name ?? f).toLowerCase()),
  );
  return Promise.all(
    families.map(async ({ family, weights }) => {
      const key = family.toLowerCase();
      if ([...captured].some((c) => c.includes(key))) {
        const files = (manifest.files ?? [])
          .filter((f: any) => f?.file && String(f.family ?? "").toLowerCase().includes(key))
          .map((f: any) => ({
            file: `assets/fonts/${f.file}`,
            weight: (f.variationAxes ?? []).includes("wght") ? "100 900" : String(f.weight ?? 400),
            style: f.style === "italic" ? "italic" : "normal",
          }));
        return { family, source: "captured" as const, use: family, files };
      }
      if (autoResolvedFonts().has(key)) return { family, source: "auto" as const, use: family };
      const name = family.trim().replace(/\s+/g, "+");
      const ws = (weights ?? []).filter((w) => w >= 100 && w <= 900).sort((a, b) => a - b);
      for (const query of [ws.length ? `${name}:wght@${ws.join(";")}` : null, name].filter(Boolean) as string[]) {
        if (await ok(`https://fonts.googleapis.com/css2?family=${query}`)) return { family, source: "google" as const, use: family, query };
      }
      return { family, source: "substitute" as const, use: /mono|code/i.test(family) ? "JetBrains Mono" : /serif|garamond|times/i.test(family) && !/sans/i.test(family) ? "EB Garamond" : "Inter" };
    }),
  );
}

async function ok(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { "user-agent": "Mozilla/5.0" } });
    return r.ok;
  } catch {
    return false;
  }
}

// The site's own logo images, from <img> tags the page marks as a logo. Captures keep SVGs
// but often skip raster marks (a Next.js `/_next/image` PNG, for example).
async function resolveLogos(captureDir: string, siteUrl: string): Promise<BrandKit["logos"]> {
  const pagePath = join(captureDir, "extracted", "page.html");
  if (!existsSync(pagePath)) return [];
  const html = readFileSync(pagePath, "utf8");
  const brand = brandSlug(siteUrl);
  const urls: string[] = [];
  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    const alt = attr(tag, "alt") ?? "";
    const src = attr(tag, "src") ?? "";
    if (!/logo/i.test(`${alt} ${src} ${attr(tag, "class") ?? ""}`) || !src || src.startsWith("data:")) continue;
    const url = realImageUrl(src, siteUrl);
    if (url && !urls.includes(url)) urls.push(url);
    if (urls.length >= 2) break;
  }
  const out: BrandKit["logos"] = svgLogos(captureDir, brand);
  for (const [i, url] of urls.entries()) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { "user-agent": "Mozilla/5.0" } });
      const type = r.headers.get("content-type") ?? "";
      const ext = ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg", "image/gif": "gif" } as Record<string, string>)[type.split(";")[0].trim()];
      if (!r.ok || !ext) continue;
      const bytes = Buffer.from(await r.arrayBuffer());
      if (bytes.length > 5_000_000) continue;
      const dir = join(captureDir, "assets", "logo");
      mkdirSync(dir, { recursive: true });
      const name = `${brand}-logo${i ? `-${i + 1}` : ""}.${ext}`;
      writeFileSync(join(dir, name), bytes);
      const meta = readMeta(join(dir, name), ext);
      out.push({ path: `capture/assets/logo/${name}`, width: meta.width, height: meta.height, from: url });
    } catch {}
  }
  return out;
}

// Captured inline-SVG logos (assets/svgs/logo-*.svg): the brand's own mark is the one whose label names
// the brand; a wide wordmark beats a square symbol. Logo walls of customers never match the label.
function svgLogos(captureDir: string, brand: string): BrandKit["logos"] {
  const dir = join(captureDir, "assets", "svgs");
  if (!existsSync(dir)) return [];
  const scored = readdirSync(dir)
    .filter((f) => /^logo-.*\.svg$/i.test(f))
    .map((f) => {
      const svg = readFileSync(join(dir, f), "utf8");
      const label = (svg.match(/aria-label="([^"]*)"/i)?.[1] ?? svg.match(/<title>([^<]*)/i)?.[1] ?? "").toLowerCase();
      const vb = svg.match(/viewBox="[\d.\s-]*?([\d.]+)\s+([\d.]+)"/);
      const [w, h] = vb ? [Number(vb[1]), Number(vb[2])] : [0, 0];
      const score = (label && label.replace(/[^a-z0-9]/g, "").includes(brand) ? 4 : 0) + (w && h && w / h >= 2 ? 1 : 0);
      return { f, score, w, h, currentColor: /currentColor/i.test(svg) };
    })
    .filter((x) => x.score >= 4)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, 1).map((x) => ({ path: `capture/assets/svgs/${x.f}`, width: x.w, height: x.h, from: "inline svg in the page", currentColor: x.currentColor }));
}

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"));
  return m ? (m[1] ?? m[2]).replace(/&amp;/g, "&") : undefined;
}

// Next.js serves images through /_next/image?url=<original>; fetch the original instead.
function realImageUrl(src: string, siteUrl: string): string | null {
  try {
    const u = new URL(src, siteUrl);
    if (u.pathname.endsWith("/_next/image") && u.searchParams.get("url")) return new URL(u.searchParams.get("url")!, u.origin).href;
    return u.href;
  } catch {
    return null;
  }
}

export function brandSlug(siteUrl: string): string {
  try {
    return new URL(siteUrl).hostname.replace(/^www\./, "").split(".")[0].replace(/[^a-z0-9-]/gi, "").toLowerCase() || "brand";
  } catch {
    return "brand";
  }
}

// The packet section builders read instead of rediscovering fonts and logos.
export function brandKitNote(kit: BrandKit): string {
  const lines = ["**Brand kit.** The harness already resolved the brand's fonts and logo. Use them as given; don't search for, download, crop, or process alternatives."];
  if (kit.fonts.length) {
    lines.push(`- Fonts (first is primary): ${kit.fonts.map((f) => `${f.family} (${f.source === "substitute" ? `not available, use ${f.use}` : f.source === "google" ? "Google Fonts" : f.source === "auto" ? "auto-resolved by HyperFrames" : "captured woff2"})`).join(", ")}.`);
    if (kit.fontImport) {
      lines.push(`- Make this the first line of the \`<style>\` block in \`index.html\` and in every sub-composition that sets these families. It is the font declaration HyperFrames lint requires; a family without it hard-fails the gate:\n  \`@import url('${kit.fontImport}');\``);
    }
  }
  for (const logo of kit.logos) {
    lines.push(`- Logo: \`${logo.path}\`${logo.width ? ` (${logo.width}×${logo.height})` : ""}, from the site's own header. Place it as an \`<img>\` with \`object-fit: contain\`${/\.svg$/i.test(logo.path) ? "" : ", no larger than its pixel size"}; never redraw, recolor, crop, or stretch it.`);
  }
  if (!kit.logos.length) lines.push("- Logo: none on the page. Set the brand name as type in the primary font; don't draw a mark.");
  lines.push("- Paths are project-relative from `index.html`; inside `compositions/*.html`, prefix them with `../`.");
  return lines.join("\n");
}
