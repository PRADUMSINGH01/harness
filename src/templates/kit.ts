// Shared pieces for quick templates (option C): a template is a fixed, pre-designed choreography;
// a spec fills it with one brand's copy, palette, font, logo and screenshot. No agent, no tool turns.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { OWN_ASSETS } from "../assets/catalog.ts";

export type Aspect = "16:9" | "9:16";

export interface Palette {
  bg: string;
  surface: string;
  ink: string;
  muted: string;
  accent: string;
  accent2: string;
}

export interface QuickSpec {
  aspect: Aspect;
  brand: {
    name: string;
    url?: string;
    font: string;
    fontImport?: string;
    // Project-relative after staging (assets/logo.png); undefined sets the name as type.
    logo?: string;
    // An SVG logo drawn in currentColor (as the site renders it), inlined so it takes the ink color.
    logoInline?: string;
    fontFaces?: { family: string; file: string; weight: string; style: string }[];
  };
  palette: Palette;
  copy: {
    kicker: string;
    headline: string; // one *word* in asterisks is the emphasis word
    subline: string;
    features: { title: string; icon: string }[];
    stat?: { value: number; prefix?: string; suffix?: string; label: string };
    callout: string;
    cta: string;
  };
  // screenshot: the first page image (templates). shots: the page top to bottom as one or more images
  // with their pixel sizes, for scrolling tours (a full-page capture, or the capture's viewport shots).
  media: { screenshot?: string; shots?: { file: string; w: number; h: number }[] };
  style: { background: string; transition: "iris" | "diagonal" | "stripes"; grain: boolean };
}

export interface TemplateOutput {
  html: string;
}

export interface Template {
  id: string;
  label: string;
  description: string;
  needs: ("screenshot" | "stat" | "features")[];
  build(spec: QuickSpec): TemplateOutput;
}

export const dims = (a: Aspect) => (a === "9:16" ? { W: 1080, H: 1920 } : { W: 1920, H: 1080 });

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Inline a creative-kit SVG so the palette variables reach it.
export function kit(rel: string, attrs = ""): string {
  const p = join(OWN_ASSETS, "creative", `${rel}.svg`);
  if (!existsSync(p)) throw new Error(`creative kit asset ${rel} is missing; run node scripts/creative-assets/build.mjs`);
  return readFileSync(p, "utf8").trim().replace(/^<svg /, `<svg ${attrs} `);
}

// Grounds bright enough that accent-colored text would sit on its own color.
export const BOLD_GROUNDS = ["grainy-gradient"];
export const BACKGROUNDS = ["aurora-mesh", "grainy-gradient", "dot-grid", "line-grid", "spotlight", "wave-lines", "topographic", "paper-cream"];

// Headline words as masked spans: <span class="w"><span>word</span></span>; *word* is the emphasis.
export function words(headline: string, cls = "w"): string {
  return headline
    .trim()
    .split(/\s+/)
    .map((w) => {
      const em = /^\*.+\*[.,!?]?$/.test(w);
      const text = esc(w.replace(/\*/g, ""));
      return `<span class="${cls}" data-layout-allow-overflow="true"><span${em ? ' class="em"' : ""}>${text}</span></span>`;
    })
    .join(" ");
}

export const plain = (s: string) => s.replace(/\*/g, "");

// WCAG contrast ratio between two #rrggbb colors.
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

// Page shell: palette variables, brand font, background layer, optional grain, the timeline.
export function shell(spec: QuickSpec, opts: { title: string; css: string; body: string; script: string }): string {
  const { W, H } = dims(spec.aspect);
  const p = spec.palette;
  const vertical = spec.aspect === "9:16";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=${W}, height=${H}" />
<title>${esc(opts.title)}</title>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
${spec.brand.fontImport ? `@import url('${spec.brand.fontImport}');\n` : ""}${(spec.brand.fontFaces ?? []).map((f) => `@font-face { font-family: '${f.family}'; src: url('${f.file}') format('woff2'); font-weight: ${f.weight}; font-style: ${f.style}; font-display: block; }\n`).join("")}:root {
  --bg: ${p.bg}; --surface: ${p.surface}; --ink: ${p.ink}; --muted: ${p.muted}; --accent: ${p.accent}; --accent-2: ${p.accent2};
  --paper: ${p.bg}; --font: '${spec.brand.font}', Inter, sans-serif;
  /* Text colors that keep their contrast on the ground; the brand accent stays for shapes. */
  --accent-text: ${contrast(p.accent, p.bg) >= 3.5 && !BOLD_GROUNDS.includes(spec.style.background) ? p.accent : p.ink}; --muted-text: ${contrast(p.muted, p.bg) >= 4 ? p.muted : p.ink};
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: ${p.bg}; }
#stage { position: relative; width: ${W}px; height: ${H}px; overflow: hidden; background: var(--bg); color: var(--ink); font-family: '${spec.brand.font}', Inter, sans-serif; }
.layer { position: absolute; inset: 0; }
.layer > svg { width: 100%; height: 100%; display: block; }
#bg { opacity: 0.9; }
#grain { mix-blend-mode: overlay; opacity: 0.22; pointer-events: none; }
.w { display: inline-block; overflow: hidden; vertical-align: bottom; padding-bottom: 0.08em; }
.w > span { display: inline-block; }
.em { color: var(--accent-text); }
#scrim { background: radial-gradient(ellipse 70% 65% at 50% 50%, ${p.bg}cc 0%, ${p.bg}99 55%, ${p.bg}00 100%); }
.center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
#lockup { gap: 40px; visibility: hidden; }
#lockup .logo { height: ${vertical ? 150 : 130}px; width: auto; object-fit: contain; }
#lockup .inline-logo { color: var(--ink); line-height: 0; }
#lockup .inline-logo svg { height: ${vertical ? 150 : 130}px; width: auto; }
#lockup .name { font-size: 120px; font-weight: 700; letter-spacing: -0.03em; }
#lockup .cta { font-size: 44px; font-weight: 600; padding: 22px 52px; border-radius: 999px; background: var(--accent); color: var(--bg); }
#lockup .url { font-size: 40px; color: var(--muted-text); letter-spacing: 0.04em; }
#wipe { pointer-events: none; }
${opts.css}
</style>
</head>
<body>
<div id="stage" data-composition-id="main" data-start="0" data-duration="10" data-fps="30" data-width="${W}" data-height="${H}">
  <div id="bg" class="layer" data-layout-allow-overflow="true">${kit(`backgrounds/${spec.style.background}`)}</div>
  <div id="scrim" class="layer"></div>
${opts.body}
  <div id="lockup" class="center">
    ${spec.brand.logoInline ? `<div class="logo inline-logo" role="img" aria-label="${esc(spec.brand.name)}">${spec.brand.logoInline}</div>` : spec.brand.logo ? `<img class="logo" src="${esc(spec.brand.logo)}" alt="${esc(spec.brand.name)}" />` : `<div class="name">${esc(spec.brand.name)}</div>`}
    <div class="cta">${esc(spec.copy.cta)}</div>
    ${spec.brand.url ? `<div class="url">${esc(spec.brand.url)}</div>` : ""}
  </div>
  <div id="wipe" class="layer" data-layout-allow-overflow="true">${wipeMarkup(spec)}</div>
  ${spec.style.grain ? `<div id="grain" class="layer">${kit("overlays/film-grain")}</div>` : ""}
</div>
<script>
const tl = gsap.timeline({ paused: true });
const IN = "power4.out", MOVE = "power2.inOut", OUT = "power2.in", EASE = "power2.out";
// Camera with intent: the ground drifts forward for the whole film.
tl.fromTo("#bg", { scale: 1 }, { scale: 1.08, duration: 10, ease: MOVE }, 0);
${opts.script}
${transitionScript(spec)}
window.__timelines["main"] = tl;
tl.seek(0);
</script>
</body>
</html>
`;
}

// The end transition: the wipe covers the frame at 7.6s, the scene swaps to the lockup under it,
// and the wipe clears by 8.3s, leaving a 1.7s lockup hold.
function wipeMarkup(spec: QuickSpec): string {
  switch (spec.style.transition) {
    case "diagonal":
      return kit("mattes/diagonal-wipe", 'preserveAspectRatio="none" style="position:absolute;top:0;left:0;width:150%;height:100%"');
    case "stripes":
      return kit("mattes/stripes-wipe", 'preserveAspectRatio="none"');
    default:
      return kit("mattes/circle-iris", 'preserveAspectRatio="xMidYMid slice"');
  }
}

function transitionScript(spec: QuickSpec): string {
  const swap = `tl.set("#scene", { autoAlpha: 0 }, 7.95);\ntl.set("#lockup", { visibility: "visible" }, 7.95);`;
  const lockup = `tl.fromTo("#lockup > *", { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: IN, stagger: 0.12 }, 8.05);`;
  switch (spec.style.transition) {
    case "diagonal":
      return `tl.fromTo("#wipe svg", { xPercent: -100 }, { xPercent: -16, duration: 0.45, ease: MOVE }, 7.5);
tl.to("#wipe svg", { xPercent: 70, duration: 0.45, ease: MOVE }, 7.95);
${swap}
${lockup}`;
    case "stripes":
      return `tl.fromTo("#wipe .bar", { scaleY: 0, transformOrigin: "50% 0%" }, { scaleY: 1, duration: 0.3, ease: MOVE, stagger: 0.02 }, 7.5);
tl.to("#wipe .bar", { scaleY: 0, transformOrigin: "50% 100%", duration: 0.3, ease: MOVE, stagger: 0.02 }, 7.98);
${swap}
${lockup}`;
    default:
      return `tl.fromTo("#wipe #circle", { scale: 0 }, { scale: 1, duration: 0.45, ease: MOVE }, 7.5);
tl.to("#wipe #circle", { scale: 0, duration: 0.45, ease: MOVE }, 7.95);
${swap}
${lockup}`;
  }
}
