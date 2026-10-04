// The launch film: up to 60s, built from the site's real parts (navbar, hero, features with their own
// icons, product screenshot, stat, pricing) as live, animated scenes. One composition, scenes as
// overlapping clips, push-slide seams in one direction (LEFT) and a zoom-through into the closing
// call to action, with the matching vector ledger written alongside.
import { contrast, dims, esc, kit, words, BOLD_GROUNDS, type Aspect, type Palette, type QuickSpec } from "../templates/kit.ts";
import type { SiteParts } from "./extract.ts";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { OWN_ASSETS } from "../assets/catalog.ts";

export interface FilmInput {
  aspect: Aspect;
  brand: QuickSpec["brand"];
  palette: Palette;
  copy: QuickSpec["copy"];
  parts: SiteParts;
  media: QuickSpec["media"];
  style: { background: string; grain: boolean };
}

export interface FilmScene {
  id: string;
  label: string;
  dur: number;
  css: string;
  html: string;
  script: (at: (t: number) => string) => string;
}

export interface Film {
  // index.html plus compositions/<scene>.html, keyed by project-relative path.
  files: Record<string, string>;
  ledger: unknown;
  duration: number;
  scenes: { id: string; label: string; start: number; dur: number }[];
}

const OVERLAP = 0.35; // each seam: the outgoing and incoming scenes share 2 x OVERLAP seconds
const MAX_SECONDS = 60;

const icon = (id: string) => kit(`icons/${existsSync(join(OWN_ASSETS, "creative", "icons", `${id}.svg`)) ? id : "sparkles"}`);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const STOP = new Set(["a", "an", "the", "and", "or", "but", "of", "to", "for", "with", "in", "on", "at", "by", "from", "into", "as", "is", "are", "was", "be", "your", "our", "their", "its", "that", "which", "who", "where", "while", "so", "because", "when", "than", "more"]);
const CLAUSE = new Set(["that", "which", "who", "where", "while", "so", "because", "when"]);

// A cut line must not end mid-thought: no trailing "that are instantly", "and the", "for".
function tidyEnd(w: string[]): string[] {
  const out = [...w];
  const clauseAt = out.findIndex((x, i) => i >= out.length - 4 && CLAUSE.has(x.toLowerCase()));
  if (clauseAt > 2) out.length = clauseAt;
  while (out.length > 2 && STOP.has(out[out.length - 1].toLowerCase().replace(/[^a-z]/g, ""))) out.pop();
  return out;
}

// Real CTAs start with an action; badges like "New: Loops →" are not buttons.
const CTA = /^(get|start|try|book|contact|sign|join|watch|see|learn|explore|open|download|request|talk|view|create|build|launch|buy|shop|order|subscribe|schedule|claim)\b/i;
export const isCta = (s: string) => CTA.test(s.trim()) && !/^new\b/i.test(s.trim());

// Keep a line short enough to read in motion: the first clause, or the first n words.
export function clip(s: string | undefined, n: number): string {
  if (!s) return "";
  const t = s.replace(/\s+/g, " ").trim();
  const clause = t.split(/(?<=[.!?])\s/)[0];
  const w = clause.split(" ");
  if (w.length <= n) return clause;
  const cut = w.slice(0, n).join(" ");
  // Break at the last clause mark (comma, semicolon, dash) past the halfway point, never mid-phrase.
  const mark = Math.max(cut.lastIndexOf(","), cut.lastIndexOf(";"), cut.lastIndexOf(" —"), cut.lastIndexOf(" –"), cut.lastIndexOf(" -"));
  const kept = (mark > cut.length * 0.5 ? cut.slice(0, mark) : cut).replace(/[\s,;:\-–—]+$/, "");
  return tidyEnd(kept.split(" ")).join(" ");
}

function logoMarkup(brand: QuickSpec["brand"], cls: string): string {
  if (brand.logoInline) return `<div class="${cls} inline-logo" role="img" aria-label="${esc(brand.name)}">${brand.logoInline}</div>`;
  if (brand.logo) return `<img class="${cls}" src="${esc(brand.logo)}" alt="${esc(brand.name)}" />`;
  return `<div class="${cls} wordmark">${esc(brand.name)}</div>`;
}

const cursorBits = `<div class="cursor">${kit("mockups/cursor-arrow")}</div><div class="ripple">${kit("mockups/click-ripple")}</div>`;
const CURSOR_CSS = `.cursor { position: absolute; width: 56px; height: 70px; right: -28px; bottom: -46px; z-index: 5; }
.ripple { position: absolute; width: 150px; height: 150px; right: -75px; bottom: -75px; z-index: 4; }
.cursor svg, .ripple svg { width: 100%; height: 100%; display: block; }`;
// A cursor that travels in from the lower right, clicks its host, and leaves a ripple.
const cursorScript = (host: string, at: (t: number) => string, arrive: number) => `tl.fromTo("${host} .cursor", { x: 520, y: 340, autoAlpha: 0 }, { x: 0, y: 0, autoAlpha: 1, duration: 1.0, ease: MOVE }, ${at(arrive - 1.0)});
tl.set("${host} .ripple", { autoAlpha: 0 }, 0);
tl.to("${host}", { scale: 0.95, duration: 0.12, ease: EASE }, ${at(arrive + 0.05)});
tl.to("${host}", { scale: 1, duration: 0.25, ease: EASE }, ${at(arrive + 0.18)});
tl.fromTo("${host} .ripple", { autoAlpha: 1, scale: 0.3 }, { scale: 1.2, duration: 0.6, ease: EASE }, ${at(arrive + 0.05)});
tl.to("${host} .ripple", { autoAlpha: 0, duration: 0.3, ease: EASE }, ${at(arrive + 0.6)});`;

function heroScene(f: FilmInput, v: boolean): FilmScene {
  const p = f.parts;
  const nav = v ? [] : p.nav.slice(0, 5);
  const ctas = [f.copy.cta || p.hero.ctas.find(isCta), ...p.hero.ctas.filter((c) => isCta(c) && norm(c) !== norm(f.copy.cta)).slice(0, 1)].filter((c): c is string => !!c).slice(0, v ? 1 : 2);
  return {
    id: "s-hero",
    label: "Site opener",
    dur: 7,
    css: `#s-hero .site-head { position: absolute; left: ${v ? 70 : 96}px; right: ${v ? 70 : 96}px; top: ${v ? 90 : 52}px; height: 80px; display: flex; align-items: center; gap: 44px; }
#s-hero .brandmark { height: ${v ? 52 : 44}px; width: auto; }
#s-hero .brandmark.inline-logo svg { height: ${v ? 52 : 44}px; width: auto; }
#s-hero nav { display: flex; gap: 40px; margin-left: 24px; flex: 1; }
#s-hero .nl { font-size: 30px; color: var(--muted-text); font-weight: 500; }
#s-hero .head-cta { margin-left: auto; font-size: 30px; font-weight: 600; padding: 14px 30px; border-radius: 999px; background: var(--ink); color: var(--bg); }
#s-hero .hero { position: absolute; inset: ${v ? "260px 70px 160px" : "200px 160px 120px"}; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 34px; }
#s-hero h1 { margin: 0; font-size: ${v ? 100 : 108}px; line-height: 1.04; font-weight: 700; letter-spacing: -0.035em; max-width: ${v ? 940 : 1520}px; }
#s-hero .sub { margin: 0; font-size: ${v ? 40 : 38}px; line-height: 1.35; color: var(--muted-text); max-width: ${v ? 900 : 1180}px; }
#s-hero .ctas { display: flex; gap: 24px; margin-top: 16px; }
#s-hero .btn { position: relative; font-size: 34px; font-weight: 600; padding: 22px 44px; border-radius: 999px; }
#s-hero .btn.primary { background: var(--accent); color: ${contrast(f.palette.bg, f.palette.accent) >= 3 ? "var(--bg)" : "var(--ink)"}; }
#s-hero .btn.ghost { border: 2px solid var(--muted); color: var(--ink); }
${CURSOR_CSS}`,
    html: `<header class="site-head">${logoMarkup(f.brand, "brandmark")}<nav>${nav.map((n) => `<span class="nl">${esc(n)}</span>`).join("")}</nav>${p.headerCta && !v ? `<span class="head-cta">${esc(p.headerCta)}</span>` : ""}</header>
<div class="hero"><h1>${words(p.hero.headline || f.copy.headline)}</h1>${p.hero.subline ? `<p class="sub">${esc(clip(p.hero.subline, 13))}</p>` : ""}<div class="ctas">${ctas.map((c, i) => `<span class="btn ${i ? "ghost" : "primary"}"${i ? "" : ' id="hero-cta"'}>${esc(c)}${i ? "" : cursorBits}</span>`).join("")}</div></div>`,
    script: (at) => `tl.fromTo("#s-hero .site-head", { y: -140, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.8, ease: IN }, ${at(0.2)});
${nav.length ? `tl.fromTo("#s-hero .nl", { y: -20, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.5, ease: IN, stagger: 0.08 }, ${at(0.6)});` : ""}
tl.fromTo("#s-hero h1 .w > span", { yPercent: 130 }, { yPercent: 0, duration: 0.8, ease: IN, stagger: 0.05 }, ${at(1.0)});
tl.fromTo("#s-hero .sub", { y: 24, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.6, ease: IN }, ${at(2.0)});
tl.fromTo("#s-hero .btn", { y: 30, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.5, ease: IN, stagger: 0.12 }, ${at(2.6)});
${cursorScript("#hero-cta", at, 4.6)}
tl.fromTo("#s-hero .hero", { scale: 1 }, { scale: 1.04, duration: 2.2, ease: MOVE }, ${at(4.8)});`,
  };
}

function statementScene(f: FilmInput, v: boolean): FilmScene {
  return {
    id: "s-statement",
    label: "Statement",
    dur: 5,
    css: `#s-statement .wrap { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 30px; padding: 0 ${v ? 70 : 160}px; }
#s-statement .kick { font-size: 34px; font-weight: 600; letter-spacing: 0.22em; text-transform: uppercase; color: var(--accent-text); }
#s-statement h2 { margin: 0; font-size: ${v ? 112 : 136}px; line-height: 1.02; font-weight: 700; letter-spacing: -0.04em; max-width: ${v ? 940 : 1600}px; }
#s-statement .under { width: ${v ? 620 : 760}px; height: ${v ? 94 : 114}px; margin-top: -14px; }
#s-statement .under svg { width: 100%; height: 100%; }
#s-statement .sub { margin: 0; font-size: 40px; color: var(--muted-text); }`,
    html: `<div class="wrap"><div class="kick">${esc(f.copy.kicker)}</div><h2>${words(f.copy.headline)}</h2><div class="under">${kit("doodles/underline-swoosh", 'preserveAspectRatio="none"')}</div>${f.copy.subline ? `<p class="sub">${esc(f.copy.subline)}</p>` : ""}</div>`,
    script: (at) => `tl.fromTo("#s-statement .kick", { y: 20, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.5, ease: IN }, ${at(0.4)});
tl.fromTo("#s-statement h2 .w > span", { yPercent: 130 }, { yPercent: 0, duration: 0.8, ease: IN, stagger: 0.08 }, ${at(0.6)});
tl.fromTo("#s-statement .under .draw", { strokeDashoffset: 1.02 }, { strokeDashoffset: 0, duration: 0.7, ease: EASE }, ${at(1.6)});
tl.fromTo("#s-statement .sub", { y: 20, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.5, ease: IN }, ${at(2.2)});
tl.fromTo("#s-statement .wrap", { scale: 1 }, { scale: 1.05, duration: 2.6, ease: MOVE }, ${at(2.4)});`,
  };
}

function featuresScene(f: FilmInput, v: boolean): FilmScene {
  const real = f.parts.features.length >= 3;
  const items = (real ? f.parts.features : f.copy.features.map((x) => ({ title: x.title, text: "", icon: undefined as string | undefined })))
    .slice(0, 4)
    .map((it, i) => ({ title: clip(it.title, 6), text: clip(it.text, 12), icon: it.icon ?? icon(f.copy.features[i]?.icon ?? "sparkles") }));
  const four = items.length === 4 && !v;
  return {
    id: "s-features",
    label: "Features",
    dur: 8.5,
    css: `#s-features .wrap { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: ${v ? 44 : 56}px; padding: 0 ${v ? 60 : 120}px; }
#s-features .kick { font-size: 34px; font-weight: 600; letter-spacing: 0.22em; text-transform: uppercase; color: var(--accent-text); }
#s-features .cards { display: grid; grid-template-columns: ${v ? "1fr" : four ? "repeat(2, 760px)" : `repeat(${items.length}, ${items.length > 3 ? 400 : 520}px)`}; gap: ${v ? 28 : 32}px; }
#s-features .card { position: relative; padding: ${v ? "34px 40px" : four ? "38px 44px" : "44px 42px"}; border-radius: 32px; background: var(--surface); border: 2px solid transparent; display: flex; flex-direction: ${v || four ? "row" : "column"}; gap: 26px; align-items: flex-start; ${v ? "width: 940px;" : ""} }
#s-features .ic { flex: none; width: 96px; height: 96px; border-radius: 24px; background: var(--bg); color: var(--accent); padding: 22px; display: flex; }
#s-features .ic svg { width: 100%; height: 100%; --ink: var(--accent); }
#s-features .t { font-size: 40px; font-weight: 700; letter-spacing: -0.01em; line-height: 1.15; }
#s-features .d { margin-top: 12px; font-size: 30px; line-height: 1.35; color: var(--muted-text); }`,
    html: `<div class="wrap"><div class="kick">Features</div><div class="cards">${items
      .map((it, i) => `<div class="card" id="feat-${i + 1}"><div class="ic">${it.icon}</div><div><div class="t">${esc(it.title)}</div>${it.text ? `<div class="d">${esc(it.text)}</div>` : ""}</div></div>`)
      .join("")}</div></div>`,
    script: (at) => `tl.fromTo("#s-features .kick", { y: 20, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.5, ease: IN }, ${at(0.4)});
tl.fromTo("#s-features .card", { x: 180, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.8, ease: IN, stagger: 0.15 }, ${at(0.6)});
tl.fromTo("#s-features .ic svg", { scale: 0.4, rotation: -20, autoAlpha: 0 }, { scale: 1, rotation: 0, autoAlpha: 1, duration: 0.6, ease: IN, stagger: 0.15 }, ${at(1.2)});
${items
  .map(
    (_, i) => `tl.to("#feat-${i + 1}", { y: -14, borderColor: "${f.palette.accent}", duration: 0.35, ease: EASE }, ${at(3.0 + i * 1.0)});
tl.to("#feat-${i + 1}", { y: 0, borderColor: "rgba(0,0,0,0)", duration: 0.35, ease: EASE }, ${at(3.0 + i * 1.0 + 0.8)});`,
  )
  .join("\n")}
tl.fromTo("#s-features .wrap", { scale: 1 }, { scale: 1.03, duration: 2.5, ease: MOVE }, ${at(5.6)});`,
  };
}

function productScene(f: FilmInput, v: boolean): FilmScene {
  const fw = v ? 960 : 1060;
  const fh = Math.round(fw * 0.625);
  const { W } = dims(f.aspect);
  const line = clip(f.copy.subline || f.parts.hero.subline, 8);
  // The page as one tall column; scroll about one and a half screens of it (exact, from real image sizes).
  const shots = f.media.shots?.length ? f.media.shots : f.media.screenshot ? [{ file: f.media.screenshot, w: 1600, h: 1000 }] : [];
  const viewH = fh * 0.912;
  const colH = shots.reduce((sum, s) => sum + fw * (s.h / s.w), 0);
  const scroll = Math.round(Math.max(0, Math.min(colH - viewH, viewH * 1.6)));
  return {
    id: "s-product",
    label: "Product tour",
    dur: 8,
    css: `#s-product .copy { position: absolute; ${v ? "left: 70px; right: 70px; top: 330px; align-items: center; text-align: center;" : "left: 120px; top: 0; bottom: 0; width: 600px; justify-content: center;"} display: flex; flex-direction: column; gap: 26px; }
#s-product .kick { font-size: 32px; font-weight: 600; letter-spacing: 0.2em; text-transform: uppercase; color: var(--accent-text); }
#s-product h3 { margin: 0; font-size: ${v ? 76 : 72}px; line-height: 1.06; font-weight: 700; letter-spacing: -0.03em; }
#s-product .device { position: absolute; width: ${fw}px; height: ${fh}px; ${v ? `left: ${(W - fw) / 2}px; top: 960px;` : "left: 780px; top: 246px;"} }
#s-product .frame, #s-product .frame svg { position: absolute; inset: 0; width: 100%; height: 100%; }
#s-product .shot { position: absolute; left: 0; right: 0; top: 8.8%; bottom: 0; overflow: hidden; border-radius: 0 0 ${Math.round(fw * 0.014)}px ${Math.round(fw * 0.014)}px; background-color: var(--surface); }
#s-product .col img { display: block; width: 100%; height: auto; }
#s-product .glow { position: absolute; inset: -60px; border-radius: 60px; background: var(--accent); opacity: 0.16; filter: blur(60px); }
#s-product .target { position: absolute; left: 60%; top: 56%; width: 8px; height: 8px; }
#s-product .callout { position: absolute; left: 60%; top: 56%; transform: translate(30px, -120px); font-size: 34px; font-weight: 700; padding: 16px 30px; border-radius: 20px; background: var(--ink); color: var(--bg); white-space: nowrap; }
${CURSOR_CSS}`,
    html: `<div class="copy"><div class="kick">See it in action</div><h3>${esc(line)}</h3></div>
<div class="device"><div class="glow"></div><div class="frame">${kit("mockups/browser-dark").replace(">yourproduct.com<", `>${esc(f.brand.url ?? "")}<`).replace("font-size:22px", "font-size:40px")}</div><div class="shot"><div class="col" data-layout-allow-overflow="true">${shots.map((s) => `<img src="${esc(s.file)}" alt="" />`).join("")}</div></div><div class="target" id="prod-target">${cursorBits}</div><div class="callout">${esc(f.copy.callout)}</div></div>`,
    script: (at) => `tl.fromTo("#s-product .kick", { y: 20, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.5, ease: IN }, ${at(0.4)});
tl.fromTo("#s-product h3", { y: 40, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.7, ease: IN }, ${at(0.6)});
tl.fromTo("#s-product .device", { y: 100, autoAlpha: 0, scale: 0.94 }, { y: 0, autoAlpha: 1, scale: 1, duration: 0.9, ease: IN }, ${at(0.5)});
tl.fromTo("#s-product .col", { y: 0 }, { y: ${-scroll}, duration: 4.2, ease: MOVE }, ${at(1.4)});
${cursorScript("#prod-target", at, 5.2)}
tl.fromTo("#s-product .callout", { autoAlpha: 0, y: 24, scale: 0.9 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.5, ease: IN }, ${at(5.4)});
tl.to("#s-product .device", { scale: 1.06, duration: 2.2, ease: MOVE, transformOrigin: "100% 56%" }, ${at(5.6)});`,
  };
}

function statScene(f: FilmInput, v: boolean): FilmScene {
  const s = f.copy.stat!;
  const decimals = Math.min(2, (String(s.value).split(".")[1] ?? "").length);
  const finalText = `${s.prefix ?? ""}${s.value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${s.suffix ?? ""}`;
  const ring = v ? 720 : 560;
  const size = Math.round(Math.min(v ? 200 : 170, (ring * 0.72) / (finalText.length * 0.6)));
  return {
    id: "s-stat",
    label: "Stat",
    dur: 5,
    css: `#s-stat .wrap { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 30px; }
#s-stat .box { position: relative; width: ${ring}px; height: ${ring}px; display: flex; align-items: center; justify-content: center; }
#s-stat .box svg { position: absolute; inset: 0; width: 100%; height: 100%; }
#s-stat .val { font-size: ${size}px; font-weight: 800; letter-spacing: -0.05em; }
#s-stat .lab { font-size: 42px; font-weight: 600; color: var(--muted-text); }`,
    html: `<div class="wrap"><div class="box"><svg viewBox="0 0 400 400"><circle cx="200" cy="200" r="180" style="fill:none;stroke:var(--surface);stroke-width:16"/><circle class="arc" cx="200" cy="200" r="180" pathLength="100" transform="rotate(-90 200 200)" style="fill:none;stroke:var(--accent);stroke-width:16;stroke-linecap:round;stroke-dasharray:0 100"/></svg><div class="val" id="stat-val">${esc(s.prefix ?? "")}0${esc(s.suffix ?? "")}</div></div><div class="lab">${esc(s.label)}</div></div>`,
    script: (at) => `count("#stat-val", ${s.value}, ${decimals}, "${esc(s.prefix ?? "")}", "${esc(s.suffix ?? "")}", ${at(0.6)}, 1.8);
tl.fromTo("#s-stat .box", { scale: 0.85, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.8, ease: IN }, ${at(0.3)});
tl.fromTo("#s-stat .arc", { strokeDasharray: "0 100" }, { strokeDasharray: "100 100", duration: 2.4, ease: EASE }, ${at(0.6)});
tl.fromTo("#s-stat .lab", { y: 24, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.5, ease: IN }, ${at(2.3)});
tl.fromTo("#s-stat .wrap", { scale: 1 }, { scale: 1.05, duration: 2.2, ease: MOVE }, ${at(2.6)});`,
  };
}

function pricingScene(f: FilmInput, v: boolean): FilmScene {
  const plans = f.parts.plans.slice(0, v ? 3 : 4);
  const anyFeatured = plans.some((p) => p.featured);
  const width = v ? 940 : plans.length === 4 ? 390 : plans.length === 3 ? 500 : 560;
  return {
    id: "s-pricing",
    label: "Pricing",
    dur: 8.5,
    css: `#s-pricing .wrap { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: ${v ? 40 : 54}px; }
#s-pricing .kick { font-size: 34px; font-weight: 600; letter-spacing: 0.22em; text-transform: uppercase; color: var(--accent-text); }
#s-pricing .plans { display: flex; flex-direction: ${v ? "column" : "row"}; gap: ${v ? 24 : 30}px; align-items: ${v ? "center" : "flex-end"}; }
#s-pricing .plan { position: relative; width: ${width}px; padding: ${v ? "30px 40px" : "44px 40px"}; border-radius: 34px; background: var(--surface); border: 2px solid transparent; display: flex; flex-direction: column; gap: ${v ? 10 : 16}px; }
#s-pricing .plan.featured { border-color: var(--accent); }
#s-pricing .badge { position: absolute; top: -26px; left: 40px; font-size: 28px; font-weight: 700; padding: 8px 22px; border-radius: 999px; background: var(--accent); color: ${contrast(f.palette.bg, f.palette.accent) >= 3 ? "var(--bg)" : "var(--ink)"}; }
#s-pricing .name { font-size: 36px; font-weight: 700; color: var(--muted-text); }
#s-pricing .price { display: flex; align-items: baseline; gap: 12px; }
#s-pricing .amt { font-size: ${v ? 84 : 96}px; font-weight: 800; letter-spacing: -0.04em; }
#s-pricing .per { font-size: 30px; color: var(--muted-text); }
#s-pricing ul { margin: ${v ? 4 : 12}px 0 0; padding: 0; list-style: none; display: ${v ? "none" : "flex"}; flex-direction: column; gap: 14px; }
#s-pricing li { font-size: 28px; line-height: 1.3; display: flex; gap: 14px; align-items: flex-start; }
#s-pricing li svg { flex: none; width: 30px; height: 30px; margin-top: 2px; }`,
    html: `<div class="wrap"><div class="kick">Pricing</div><div class="plans">${plans
      .map((p, i) => {
        const prefix = p.price.replace(/[\d.,\s].*$/, "");
        const counted = p.amount !== undefined && p.amount > 0;
        return `<div class="plan${p.featured ? " featured" : ""}" id="plan-${i + 1}">${p.featured ? '<div class="badge">Most popular</div>' : ""}<div class="name">${esc(p.name)}</div><div class="price"><span class="amt" id="amt-${i + 1}"${counted ? ` data-to="${p.amount}" data-prefix="${esc(prefix)}"` : ""}>${esc(counted ? `${prefix}0` : p.price)}</span>${p.period ? `<span class="per">${esc(p.period)}</span>` : ""}</div><ul>${p.features
          .slice(0, 3)
          .map((x) => `<li><svg viewBox="0 0 24 24"><path class="draw" pathLength="1" d="M5 12.5 l4.5 4.5 L19 7" style="fill:none;stroke:var(--accent);stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1 1.05;stroke-dashoffset:0"/></svg><span>${esc(clip(x, 7))}</span></li>`)
          .join("")}</ul></div>`;
      })
      .join("")}</div></div>`,
    script: (at) => `tl.fromTo("#s-pricing .kick", { y: 20, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.5, ease: IN }, ${at(0.3)});
tl.fromTo("#s-pricing .plan", { x: 200, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.8, ease: IN, stagger: 0.15 }, ${at(0.5)});
${plans
  .map((p, i) => {
    const prefix = p.price.replace(/[\d.,\s].*$/, "");
    return p.amount !== undefined && p.amount > 0 ? `count("#amt-${i + 1}", ${p.amount}, ${Number.isInteger(p.amount) ? 0 : 2}, "${esc(prefix)}", "", ${at(1.0 + i * 0.15)}, 1.6);` : "";
  })
  .join("\n")}
tl.fromTo("#s-pricing li", { x: 30, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.4, ease: IN, stagger: 0.05 }, ${at(2.6)});
tl.fromTo("#s-pricing li .draw", { strokeDashoffset: 1.02 }, { strokeDashoffset: 0, duration: 0.4, ease: EASE, stagger: 0.05 }, ${at(2.8)});
${anyFeatured ? `tl.to("#s-pricing .plan.featured", { y: -26, scale: 1.04, duration: 0.6, ease: IN }, ${at(4.4)});
tl.fromTo("#s-pricing .badge", { scale: 0.6, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.5, ease: IN }, ${at(4.6)});` : ""}
tl.fromTo("#s-pricing .wrap", { scale: 1 }, { scale: 1.03, duration: 2.6, ease: MOVE }, ${at(5.5)});`,
  };
}

function ctaScene(f: FilmInput, v: boolean): FilmScene {
  const line = clip(f.copy.headline.replace(/\*/g, ""), 8);
  return {
    id: "s-cta",
    label: "Call to action",
    dur: 6,
    css: `#s-cta .wrap { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 42px; text-align: center; padding: 0 ${v ? 70 : 160}px; }
#s-cta .biglogo { height: ${v ? 150 : 130}px; width: auto; }
#s-cta .biglogo.inline-logo { color: var(--ink); line-height: 0; }
#s-cta .biglogo.inline-logo svg { height: ${v ? 150 : 130}px; width: auto; }
#s-cta .wordmark { font-size: 130px; font-weight: 800; letter-spacing: -0.04em; height: auto; }
#s-cta .line { margin: 0; font-size: ${v ? 64 : 60}px; font-weight: 700; letter-spacing: -0.02em; max-width: ${v ? 940 : 1400}px; }
#s-cta .btn { position: relative; font-size: 40px; font-weight: 700; padding: 24px 56px; border-radius: 999px; background: var(--accent); color: ${contrast(f.palette.bg, f.palette.accent) >= 3 ? "var(--bg)" : "var(--ink)"}; }
#s-cta .url { font-size: 36px; color: var(--muted-text); letter-spacing: 0.04em; }
${CURSOR_CSS}`,
    html: `<div class="wrap">${logoMarkup(f.brand, "biglogo")}<p class="line">${esc(line)}</p><span class="btn" id="cta-btn">${esc(f.copy.cta)}${cursorBits}</span>${f.brand.url ? `<div class="url">${esc(f.brand.url)}</div>` : ""}</div>`,
    script: (at) => `tl.fromTo("#s-cta .biglogo", { scale: 0.85, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.8, ease: IN }, ${at(0.35)});
tl.fromTo("#s-cta .line", { y: 30, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.6, ease: IN }, ${at(0.9)});
tl.fromTo("#s-cta #cta-btn", { y: 30, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.6, ease: IN }, ${at(1.3)});
tl.fromTo("#s-cta .url", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5, ease: EASE }, ${at(1.7)});
${cursorScript("#cta-btn", at, 3.0)}`,
  };
}

// Word overlap: a statement that mostly repeats the hero headline adds nothing.
function similar(a: string, b: string): boolean {
  const A = new Set(norm(a).split(" ").filter((w) => w.length > 2));
  const B = new Set(norm(b).split(" ").filter((w) => w.length > 2));
  if (!A.size || !B.size) return false;
  const shared = [...A].filter((w) => B.has(w)).length;
  return shared / Math.min(A.size, B.size) >= 0.6;
}

// Scene content arrives while its scene is still sliding in: entries lead the cut by this much.
const LEAD = 0.45;

export function buildFilm(f: FilmInput): Film {
  const v = f.aspect === "9:16";
  const { W, H } = dims(f.aspect);
  // Asset paths stay root-relative inside compositions/: HyperFrames serves every composition from the project root.
  const sf = f;
  const scenes: FilmScene[] = [heroScene(sf, v)];
  if (!similar(f.copy.headline.replace(/\*/g, ""), f.parts.hero.headline)) scenes.push(statementScene(sf, v));
  if (f.parts.features.length >= 3 || f.copy.features.length >= 3) scenes.push(featuresScene(sf, v));
  if (f.media.shots?.length || f.media.screenshot) scenes.push(productScene(sf, v));
  if (f.copy.stat) scenes.push(statScene(sf, v));
  if (f.parts.plans.length >= 2) scenes.push(pricingScene(sf, v));
  scenes.push(ctaScene(sf, v));
  // Never past the cap: optional middle scenes go first.
  while (scenes.reduce((s, x) => s + x.dur, 0) > MAX_SECONDS && scenes.length > 3) scenes.splice(scenes.length - 2, 1);

  let t = 0;
  const timed = scenes.map((s, i) => {
    const start = t;
    t += s.dur;
    const last = i === scenes.length - 1;
    // Each scene's clip window: it overlaps its neighbours by OVERLAP on each side of every cut.
    const from = i === 0 ? 0 : start - OVERLAP;
    return { ...s, start, from, to: last ? t : start + s.dur + OVERLAP, index: i, last };
  });
  const duration = Math.round(t * 100) / 100;
  const p = f.palette;
  const bold = BOLD_GROUNDS.includes(f.style.background);
  const zoomInto = (i: number) => i === timed.length - 1 && i > 0; // the closing scene arrives by zoom-through

  const files: Record<string, string> = {};
  for (const s of timed) {
    const local = (x: number) => Math.max(0, x).toFixed(2);
    // Scene clock: 0 is the clip's first frame. Entries lead the cut so nothing slides in empty.
    const at = (x: number) => local(s.start - s.from + x - (s.index === 0 ? 0 : LEAD));
    const cutIn = s.start - s.from; // local time of this scene's own cut
    const cutOut = s.start + s.dur - s.from; // local time of the next cut
    const seamIn =
      s.index === 0
        ? ""
        : zoomInto(s.index)
          ? `tl.fromTo("#${s.id} .sc", { scale: 0.8, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: ${OVERLAP + 0.1}, ease: EASE }, ${local(cutIn)});`
          : `tl.fromTo("#${s.id} .sc", { xPercent: 100 }, { xPercent: 0, duration: ${2 * OVERLAP}, ease: MOVE }, ${local(cutIn - OVERLAP)});`;
    const seamOut = s.last
      ? ""
      : zoomInto(s.index + 1)
        ? `tl.to("#${s.id} .sc", { scale: 1.35, autoAlpha: 0, duration: ${OVERLAP}, ease: OUT }, ${local(cutOut - OVERLAP)});`
        : `tl.to("#${s.id} .sc", { xPercent: -100, duration: ${2 * OVERLAP}, ease: MOVE }, ${local(cutOut - OVERLAP)});`;
    files[`compositions/${s.id}.html`] = `<!doctype html>
<html>
<head><meta charset="UTF-8" /><title>${esc(s.label)}</title></head>
<body>
<template>
<style>
#root { position: absolute; inset: 0; }
#${s.id} { position: absolute; inset: 0; }
#${s.id} .sc { position: absolute; inset: 0; }
${s.css}
</style>
<div id="root" data-composition-id="${s.id}" data-width="${W}" data-height="${H}">
<div id="${s.id}"><div class="sc" data-layout-allow-overflow="true">
${s.html}
</div></div>
</div>
<script>
(() => {
  const tl = gsap.timeline({ paused: true });
  const IN = "power4.out", MOVE = "power3.inOut", OUT = "power2.in", EASE = "power2.out";
  // Scenes adapt per format (vertical drops the navbar, short plans drop features): absent parts are expected.
  gsap.config({ nullTargetWarn: false });
  // Seek-safe count-up: the tween's onUpdate writes the number on every seek.
  const count = (sel, to, decimals, prefix, suffix, at, dur) => {
    const el = document.querySelector(sel);
    if (!el) return;
    const box = { v: 0 };
    const fmt = (n) => prefix + n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
    tl.fromTo(box, { v: 0 }, { v: to, duration: dur, ease: EASE, onUpdate: () => { el.textContent = fmt(box.v); } }, at);
  };
  ${seamIn}
${s.script(at)}
  ${seamOut}
  window.__timelines = window.__timelines || {};
  window.__timelines["${s.id}"] = tl;
})();
</script>
</template>
</body>
</html>
`;
  }

  const ledger = {
    current: "LEFT",
    note: "Generated by the harness launch film: push-slide LEFT on every ordinary seam, zoom-through (PUSH) into the closing call to action.",
    seams: timed.slice(1).map((s) => {
      const prev = timed[s.index - 1];
      const zoom = zoomInto(s.index);
      return {
        id: `${prev.id}->${s.id}`,
        cut: Math.round(s.start * 100) / 100,
        type: "cut",
        technique: zoom ? "zoom-through" : "push-slide LEFT",
        exit: { selector: `#${prev.id} .sc`, axis: zoom ? "z" : "x", dir: zoom ? 1 : -1 },
        entry: { selector: `#${s.id} .sc`, axis: zoom ? "z" : "x", dir: zoom ? 1 : -1 },
      };
    }),
  };

  files["index.html"] = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=${W}, height=${H}" />
<title>${esc(f.brand.name)} launch film</title>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
${f.brand.fontImport ? `@import url('${f.brand.fontImport}');\n` : ""}${(f.brand.fontFaces ?? []).map((x) => `@font-face { font-family: '${x.family}'; src: url('${x.file}') format('woff2'); font-weight: ${x.weight}; font-style: ${x.style}; font-display: block; }\n`).join("")}:root {
  --bg: ${p.bg}; --surface: ${p.surface}; --ink: ${p.ink}; --muted: ${p.muted}; --accent: ${p.accent}; --accent-2: ${p.accent2}; --paper: ${p.bg};
  --font: '${f.brand.font}', Inter, sans-serif;
  --accent-text: ${contrast(p.accent, p.bg) >= 3.5 && !bold ? p.accent : p.ink}; --muted-text: ${contrast(p.muted, p.bg) >= 4 ? p.muted : p.ink};
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: ${p.bg}; }
#stage { position: relative; width: ${W}px; height: ${H}px; overflow: hidden; background: var(--bg); color: var(--ink); font-family: '${f.brand.font}', Inter, sans-serif; }
.layer { position: absolute; inset: 0; }
.layer > svg { width: 100%; height: 100%; display: block; }
#bg { opacity: 0.85; }
#scrim { background: radial-gradient(ellipse 72% 68% at 50% 50%, ${p.bg}d9 0%, ${p.bg}a6 55%, ${p.bg}33 100%); }
#grain { mix-blend-mode: overlay; opacity: 0.2; pointer-events: none; }
/* Shared by every scene: masked words, emphasis, inline logos. */
.w { display: inline-block; overflow: hidden; vertical-align: bottom; padding-bottom: 0.08em; }
.w > span { display: inline-block; }
.em { color: var(--accent-text); }
.inline-logo { color: var(--ink); line-height: 0; display: inline-flex; }
.wordmark { font-weight: 800; font-size: 40px; letter-spacing: -0.03em; }
</style>
</head>
<body>
<div id="stage" data-composition-id="main" data-start="0" data-duration="${duration}" data-fps="30" data-width="${W}" data-height="${H}">
  <div id="bg" class="layer" data-layout-allow-overflow="true">${kit(`backgrounds/${f.style.background}`)}</div>
  <div id="scrim" class="layer"></div>
${timed
  .map(
    (s) =>
      `  <div id="mount-${s.id}" data-composition-id="${s.id}" data-composition-src="compositions/${s.id}.html" data-start="${s.from.toFixed(2)}" data-duration="${(s.to - s.from).toFixed(2)}" data-track-index="${s.index + 1}" data-width="${W}" data-height="${H}"></div>`,
  )
  .join("\n")}
  ${f.style.grain ? `<div id="grain" class="layer">${kit("overlays/film-grain")}</div>` : ""}
</div>
<script>
const tl = gsap.timeline({ paused: true });
// Camera with intent: the ground drifts with the film's current for the whole runtime.
tl.fromTo("#bg", { scale: 1.06, xPercent: 2 }, { scale: 1.14, xPercent: -2, duration: ${duration}, ease: "none" }, 0);
window.__timelines["main"] = tl;
tl.seek(0);
</script>
</body>
</html>
`;
  return { files, ledger, duration, scenes: timed.map((s) => ({ id: s.id, label: s.label, start: s.start, dur: s.dur })) };
}
