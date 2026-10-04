// The website trailer: the landing page's cloned components (real HTML/CSS, see clone.ts) filmed
// like a product trailer. Each scene is a camera on live UI: the header drops in and the real
// headline rises word by word, the whole page flies by in 3D, the real feature cards build up,
// long sections are explored top to bottom with the camera starting tight on their heading, and the
// real button gets clicked. The site's own ground, fonts and colors are the film's; nothing is generic.
import { kit } from "../templates/kit.ts";
import type { CloneKit, ClonedPart } from "./clone.ts";

export interface TrailerScene {
  id: string;
  label: string;
  dur: number;
  enter: "whip" | "zoom" | "cut";
  css: string;
  html: string;
  script: (at: (t: number) => string) => string;
}

export interface Trailer {
  files: Record<string, string>;
  ledger: unknown;
  duration: number;
  scenes: { id: string; label: string; start: number; dur: number }[];
}

const OVERLAP = 0.3;
const MAX_SECONDS = 60;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Shared runtime for every scene: the reveal and camera helpers, written once into each scene script.
const RUNTIME = `
  const IN = "power4.out", MOVE = "power3.inOut", OUT = "power2.in", EASE = "power2.out";
  gsap.config({ nullTargetWarn: false });
  const q = (sel, root) => [...(root || document).querySelectorAll(sel)];
  // Words rise through their masks; icons pop; buttons land; remaining blocks build in order.
  const reveal = (part, at, opts = {}) => {
    if (!part) return;
    const words = q('[data-hf="w"] > span', part);
    if (words.length) tl.fromTo(words, { yPercent: 115 }, { yPercent: 0, duration: 0.7, ease: IN, stagger: Math.min(0.06, 0.6 / words.length) }, at);
    const blocks = q(':scope > * > *', part).filter((el) => !el.querySelector('[data-hf="w"]') && !el.matches('[data-hf="w"]'));
    if (blocks.length) tl.fromTo(blocks, { y: 36, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.6, ease: IN, stagger: Math.min(0.1, 0.6 / blocks.length) }, at + (opts.blocksAfter ?? 0.25));
    const icons = q('[data-hf="icon"]', part).slice(0, 24);
    if (icons.length) tl.fromTo(icons, { scale: 0.4, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.5, ease: IN, stagger: Math.min(0.04, 0.6 / icons.length) }, at + (opts.iconsAfter ?? 0.45));
  };
  // A cursor travels in, presses the part's first real button, and leaves a ripple.
  const click = (part, at, markup) => {
    const btn = part && part.querySelector('[data-hf="button"]');
    if (!btn) return;
    if (getComputedStyle(btn).position === "static") btn.style.position = "relative";
    btn.insertAdjacentHTML("beforeend", markup);
    const cur = btn.querySelector(".hf-cursor"), rip = btn.querySelector(".hf-ripple");
    tl.fromTo(cur, { x: 420, y: 260, autoAlpha: 0 }, { x: 0, y: 0, autoAlpha: 1, duration: 1.0, ease: MOVE }, at - 1.0);
    tl.to(btn, { scale: 0.94, duration: 0.12, ease: EASE }, at + 0.05);
    tl.to(btn, { scale: 1, duration: 0.25, ease: EASE }, at + 0.18);
    tl.fromTo(rip, { autoAlpha: 1, scale: 0.3 }, { scale: 1.3, duration: 0.6, ease: EASE }, at + 0.05);
    tl.to(rip, { autoAlpha: 0, duration: 0.3, ease: EASE }, at + 0.6);
  };
  // Camera: start tight on the part's first heading, ease back to the full frame.
  // Real numbers count up from zero to the value the site shows, keeping its prefix, suffix and separators.
  const countUp = (root, at) => {
    if (!root) return;
    q('[data-hf="stat"]', root).slice(0, 12).forEach((el, i) => {
      const to = parseFloat(el.dataset.to), dec = +(el.dataset.dec || 0), pre = el.dataset.prefix || "", suf = el.dataset.suffix || "", sep = el.dataset.sep === "1";
      if (!isFinite(to)) return;
      const box = { v: 0 };
      const fmt = (n) => pre + (sep ? n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }) : n.toFixed(dec)) + suf;
      tl.fromTo(box, { v: 0 }, { v: to, duration: 1.4, ease: EASE, onUpdate: () => { el.textContent = fmt(box.v); } }, at + i * 0.06);
    });
  };
  const focusOn = (cam, part, at, dur, from = 1.35) => {
    const h = part && part.querySelector('[data-hf="h1"], [data-hf="h2"], [data-hf="h3"]');
    if (!h) return;
    const pr = part.getBoundingClientRect(), hr = h.getBoundingClientRect();
    const ox = ((hr.left + hr.width / 2 - pr.left) / pr.width) * 100, oy = ((hr.top + hr.height / 2 - pr.top) / pr.height) * 100;
    tl.fromTo(cam, { scale: from, transformOrigin: ox.toFixed(1) + "% " + oy.toFixed(1) + "%" }, { scale: 1, duration: dur, ease: MOVE }, at);
  };
`;

const CURSOR = `<span class="hf-cursor" style="position:absolute;right:-26px;bottom:-40px;width:50px;height:62px;z-index:20;pointer-events:none">${kit("mockups/cursor-arrow").replace("<svg ", '<svg style="width:100%;height:100%;display:block" ')}</span><span class="hf-ripple" style="position:absolute;right:-70px;bottom:-70px;width:140px;height:140px;z-index:19;pointer-events:none;opacity:0">${kit("mockups/click-ripple").replace("<svg ", '<svg style="width:100%;height:100%;display:block" ')}</span>`;

// A part placed in the frame: scaled to fit a target width (live HTML stays sharp at any scale).
function placed(part: ClonedPart, scale: number, extra = "") {
  return `<div class="part-wrap" style="position:absolute;left:50%;top:50%;width:${part.w}px;height:${part.h}px;margin-left:${-part.w / 2}px;margin-top:${-part.h / 2}px;transform:scale(${scale.toFixed(3)});${extra}">${part.html}</div>`;
}

// A part that takes real layout space at a scale, for stacking pieces in a column.
function sized(part: ClonedPart, scale: number, cls = "") {
  return `<div class="piece ${cls}" style="position:relative;width:${Math.round(part.w * scale)}px;height:${Math.round(part.h * scale)}px"><div style="position:absolute;left:0;top:0;width:${part.w}px;height:${part.h}px;transform:scale(${scale.toFixed(3)});transform-origin:0 0">${part.html}</div></div>`;
}

const get = (k: CloneKit, name: string) => k.parts.find((p) => p.name === name && p.w > 0 && p.h > 0);
// The hero's ground (color or image) for scenes built from its pieces.
const heroGround = (k: CloneKit) => get(k, "headline")?.ground ?? get(k, "hero")?.ground;
const groundCss = (id: string, ground?: string) => (ground ? `#${id} .sc { ${ground}; }` : "");

// Logo sting: the site's real mark, large, arriving out of a soft light.
function logoScene(k: CloneKit, W: number, H: number): TrailerScene | null {
  const logo = get(k, "logo");
  if (!logo) return null;
  const s = Math.min((H * 0.13) / logo.h, (W * 0.42) / logo.w);
  return {
    id: "s-logo",
    label: "Logo sting",
    dur: 2.8,
    enter: "cut",
    css: `${groundCss("s-logo", get(k, "logo")?.ground ?? heroGround(k))}
#s-logo .halo { position: absolute; left: 50%; top: 50%; width: ${Math.round(W * 0.7)}px; height: ${Math.round(W * 0.7)}px; margin: ${-Math.round(W * 0.35)}px 0 0 ${-Math.round(W * 0.35)}px; border-radius: 50%; background: radial-gradient(closest-side, ${k.theme.ink}22, transparent 70%); }`,
    html: `<div class="halo"></div>${placed(logo, s)}`,
    script: (at) => `tl.fromTo("#s-logo .halo", { scale: 0.4, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.9, ease: IN }, ${at(0.1)});
tl.fromTo("#s-logo .part-wrap", { autoAlpha: 0, filter: "blur(14px)" }, { autoAlpha: 1, filter: "blur(0px)", duration: 0.9, ease: IN }, ${at(0.25)});
tl.fromTo("#s-logo .sc", { scale: 1.08 }, { scale: 1, duration: 2.6, ease: MOVE }, ${at(0)});`,
  };
}

// The real headline, large: words rise in the site's own type, the supporting line and the real
// buttons follow, and the cursor presses the primary button.
function headlineScene(k: CloneKit, W: number, H: number): TrailerScene | null {
  const headline = get(k, "headline");
  if (!headline) return null;
  const sub = get(k, "subline");
  const buttons = get(k, "buttons");
  const s = Math.min((W * 0.62) / headline.w, (H * 0.42) / headline.h, 2.6);
  const ss = Math.min(s * 0.62, (W * 0.6) / Math.max(sub?.w ?? 1, 1), 1.9);
  const bs = Math.min(s * 0.7, 2);
  return {
    id: "s-head",
    label: "Headline: the real hero",
    dur: 4.8,
    enter: "whip",
    css: `${groundCss("s-head", heroGround(k))}
#s-head .col { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: ${Math.round(H * 0.045)}px; }`,
    html: `<div class="col">${sized(headline, s, "h")}${sub ? sized(sub, ss, "sub") : ""}${buttons ? sized(buttons, bs, "btns") : ""}</div>`,
    script: (at) => `const words = q('#s-head .h [data-hf="w"] > span');
tl.fromTo(words, { yPercent: 115 }, { yPercent: 0, duration: 0.8, ease: IN, stagger: Math.min(0.08, 0.6 / Math.max(words.length, 1)) }, ${at(0.35)});
tl.fromTo("#s-head .sub", { y: 24, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.6, ease: IN }, ${at(1.3)});
tl.fromTo("#s-head .btns", { y: 30, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.6, ease: IN }, ${at(1.7)});
click(document.querySelector("#s-head .btns"), ${at(3.2)}, ${JSON.stringify(CURSOR)});
tl.fromTo("#s-head .col", { scale: 1 }, { scale: 1.05, duration: 4.4, ease: MOVE }, ${at(0.2)});`,
  };
}

// The whole page as one tilted plane the camera glides along: the site, in 3D, all live HTML.
function flyoverScene(k: CloneKit, W: number, H: number): TrailerScene | null {
  const stack = k.parts.filter((p) => ["hero", "features"].includes(p.name) || /^section-d+$/.test(p.name)).slice(0, 5);
  if (stack.length < 2) return null;
  const width = Math.max(...stack.map((p) => p.w));
  const scale = (W * 0.62) / width;
  const total = stack.reduce((sum, p) => sum + p.h + 80, 0) * scale;
  const travel = Math.max(0, total - H * 0.9);
  return {
    id: "s-fly",
    label: "Flyover: the page in 3D",
    dur: 6,
    enter: "whip",
    css: `#s-fly .space { position: absolute; inset: 0; perspective: 2200px; perspective-origin: 50% 30%; }
#s-fly .plane { position: absolute; left: 50%; top: 0; width: ${Math.round(width * scale)}px; margin-left: ${-Math.round((width * scale) / 2)}px; transform-style: preserve-3d; }
#s-fly .sheet { position: relative; width: ${width}px; transform: scale(${scale.toFixed(4)}); transform-origin: 0 0; display: flex; flex-direction: column; align-items: center; gap: 80px; padding-top: 60px; }
#s-fly .glow { position: absolute; inset: -10% -20%; background: radial-gradient(50% 40% at 50% 40%, ${k.theme.ink}14, transparent 70%); }`,
    html: `<div class="glow"></div><div class="space" data-layout-ignore="true"><div class="plane"><div class="sheet">${stack.map((p) => p.html).join("")}</div></div></div>`,
    script: (at) => `tl.fromTo("#s-fly .plane", { rotateX: 34, rotateZ: -10, y: ${Math.round(H * 0.08)}, z: -360 }, { rotateX: 24, rotateZ: -6, y: ${-Math.round(travel)}, z: -120, duration: 6.2, ease: MOVE }, ${at(-0.2)});`,
  };
}

// The real feature cards, large, arriving from depth; the camera tracks along the row.
function featuresScene(k: CloneKit, W: number, H: number): TrailerScene | null {
  const part = get(k, "features");
  if (!part) return null;
  // A tall feature column (not a row of cards) is filmed like a section: framed from its top, glided down.
  if (part.h > part.w * 0.6) return { ...sectionScene(part, "s-feat", W, H), label: "Features: the real feature list" };
  const s = Math.min(Math.max((H * 0.2) / part.h, (W * 1.0) / part.w), 2.4);
  const overflow = Math.max(0, part.w * s - W * 0.9);
  return {
    id: "s-feat",
    label: "Features: the real cards",
    dur: 5,
    enter: "whip",
    css: `#s-feat .space { position: absolute; inset: 0; perspective: 1800px; }
#s-feat .title { position: absolute; left: 0; right: 0; top: ${Math.round(H * 0.2)}px; text-align: center; font-size: 64px; letter-spacing: -0.02em; color: ${k.theme.ink}; }`,
    html: `${part.title ? `<div class="title">${esc(part.title)}</div>` : ""}<div class="space">${placed(part, s)}</div>`,
    script: (at) => `const part = document.querySelector('#s-feat [data-hf-part="features"]');
const cards = q(':scope > *', part);
${part.title ? `tl.fromTo("#s-feat .title", { y: 30, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.6, ease: IN }, ${at(0.2)});` : ""}
tl.fromTo(cards, { z: -900, rotateY: -32, autoAlpha: 0 }, { z: 0, rotateY: 0, autoAlpha: 1, duration: 0.9, ease: IN, stagger: 0.15 }, ${at(0.35)});
tl.fromTo(q('[data-hf="icon"]', part), { scale: 0.3, rotation: -20 }, { scale: 1, rotation: 0, duration: 0.6, ease: IN, stagger: 0.15 }, ${at(0.85)});
cards.forEach((c, i) => {
  tl.to(c, { y: -10, duration: 0.35, ease: EASE }, ${at(2.1)} + i * 0.7);
  tl.to(c, { y: 0, duration: 0.35, ease: EASE }, ${at(2.1)} + i * 0.7 + 0.6);
});
tl.fromTo("#s-feat .part-wrap", { x: ${Math.round(overflow / 2)} }, { x: ${-Math.round(overflow / 2)}, duration: 4.8, ease: MOVE }, ${at(0.1)});`,
  };
}

// A section explored like a camera move: framed from its top, a gentle push on its heading, then a
// glide down to its end while its pieces build in order.
function sectionScene(part: ClonedPart, i: number | string, W: number, H: number): TrailerScene {
  const s = Math.min((W * 0.84) / part.w, 1.4);
  const shownH = part.h * s;
  const pan = Math.max(0, shownH - H * 0.86);
  const id = typeof i === "number" ? `s-sec${i + 1}` : i;
  const dur = pan > 300 ? 6 : 5;
  const top = Math.round(H * 0.07);
  return {
    id,
    label: `Section: ${part.title ?? part.name}`,
    dur,
    enter: "whip",
    css: `#${id} .cam { position: absolute; inset: 0; }
#${id} .pan { position: absolute; left: 50%; top: ${top}px; width: ${Math.round(part.w * s)}px; margin-left: ${-Math.round((part.w * s) / 2)}px; }`,
    html: `<div class="cam"><div class="pan">${sized(part, s)}</div></div>`,
    script: (at) => `const part = document.querySelector('#${id} [data-hf-part="${part.name}"]');
reveal(part, ${at(0.25)});
tl.fromTo("#${id} .cam", { scale: 1.06, transformOrigin: "50% 20%" }, { scale: 1, duration: 2, ease: MOVE }, ${at(0.2)});
${pan > 0 ? `tl.fromTo("#${id} .pan", { y: 0 }, { y: ${-Math.round(pan)}, duration: ${(dur - 1.6).toFixed(1)}, ease: MOVE }, ${at(1.3)});` : ""}`,
  };
}

// End card: the real logo, the real headline, the real buttons (clicked), and the address.
function closeScene(k: CloneKit, W: number, H: number): TrailerScene | null {
  const headline = get(k, "headline");
  const logo = get(k, "logo");
  const buttons = get(k, "buttons");
  if (!headline && !logo) return null;
  const hs = headline ? Math.min((W * 0.5) / headline.w, (H * 0.3) / headline.h, 2) : 1;
  const ls = logo ? Math.min((H * 0.07) / logo.h, (W * 0.25) / logo.w) : 1;
  const bs = buttons ? Math.min(hs * 0.8, 1.8) : 1;
  return {
    id: "s-close",
    label: "End card: logo, headline, real button",
    dur: 5.5,
    enter: "zoom",
    css: `${groundCss("s-close", heroGround(k))}
#s-close .col { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: ${Math.round(H * 0.045)}px; }
#s-close .url { font-size: 32px; letter-spacing: 0.08em; color: ${k.theme.muted}; }`,
    html: `<div class="col">${logo ? sized(logo, ls, "lg") : ""}${headline ? sized(headline, hs, "h") : ""}${buttons ? sized(buttons, bs, "btns") : ""}<div class="url">${esc(k.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""))}</div></div>`,
    script: (at) => `tl.fromTo("#s-close .lg", { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: IN }, ${at(0.3)});
const words = q('#s-close .h [data-hf="w"] > span');
tl.fromTo(words, { yPercent: 115 }, { yPercent: 0, duration: 0.8, ease: IN, stagger: Math.min(0.06, 0.6 / Math.max(words.length, 1)) }, ${at(0.5)});
tl.fromTo("#s-close .btns", { y: 30, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.6, ease: IN }, ${at(1.3)});
tl.fromTo("#s-close .url", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6, ease: EASE }, ${at(1.7)});
click(document.querySelector("#s-close .btns"), ${at(3.0)}, ${JSON.stringify(CURSOR)});`,
  };
}

// A feature beat: the section's real title and its most visual element, on the section's own ground.
// Side layout: title on one side, the visual large on the other, landing from depth; then the title
// clears and the camera dives into the visual's first card until its real copy fills the frame. Stack layout (wide strips,
// vertical video): title above, the visual below at reading size, panning when it outruns the frame.
// A light sweep crosses the visual and real numbers inside count up.
function featureBeat(k: CloneKit, n: number, W: number, H: number): TrailerScene | null {
  const section = get(k, `section-${n}`);
  const title = get(k, `section-${n}-title`);
  const visual = get(k, `section-${n}-visual`);
  if (!title || !visual) return section ? sectionScene(section, n - 1, W, H) : null;
  const v = H > W;
  const stack = v || visual.w / visual.h > 3;
  const id = `s-beat${n}`;
  const dark = k.theme.dark;
  const flip = n % 2 === 0 && !stack; // alternate sides beat to beat
  let ts: number, vs: number;
  if (!stack) {
    ts = Math.min((W * 0.3) / title.w, (H * 0.45) / title.h, 2.1);
    vs = Math.min((W * 0.56) / visual.w, (H * 0.78) / visual.h, 1.9);
  } else {
    ts = Math.min((W * (v ? 0.86 : 0.7)) / title.w, (H * (v ? 0.18 : 0.2)) / title.h, 2.1);
    vs = visual.w / visual.h > 3 ? Math.min((H * (v ? 0.3 : 0.4)) / visual.h, 1.9) : Math.min((W * 0.9) / visual.w, (H * 0.5) / visual.h, 1.9);
  }
  const travel = stack ? Math.max(0, Math.round(visual.w * vs - W * 0.92)) : 0;
  const tilt = stack ? "rotateX: 22, rotateY: 0" : `rotateY: ${flip ? 26 : -26}, rotateX: 8`;
  const rest = stack ? "rotateX: 6, rotateY: 0" : `rotateY: ${flip ? 8 : -8}, rotateX: 4`;
  const drift = stack ? "rotateX: 0" : `rotateY: ${flip ? -4 : 4}, rotateX: 0`;
  return {
    id,
    label: `Feature: ${title.title ?? section?.title ?? `section ${n}`}`,
    dur: 4.8,
    enter: "whip",
    css: `${groundCss(id, title.ground ?? section?.ground)}
#${id} .row { position: absolute; inset: 0; display: flex; flex-direction: ${stack ? "column" : flip ? "row-reverse" : "row"}; align-items: center; justify-content: center; gap: ${stack ? (v ? 70 : 56) : 90}px; padding: 0 ${stack ? 0 : 70}px; }
#${id} .space { perspective: 1800px; }
#${id} .cam { transform-style: preserve-3d; }
#${id} .float { position: relative; transform-style: preserve-3d; filter: drop-shadow(0 50px 70px ${dark ? "rgba(0,0,0,0.6)" : "rgba(20,24,40,0.22)"}); }
#${id} .sweep { position: absolute; inset: 0; overflow: hidden; pointer-events: none; border-radius: 16px; mix-blend-mode: ${dark ? "screen" : "soft-light"}; }
#${id} .sweep .beam { position: absolute; top: -20%; bottom: -20%; width: 40%; left: -50%; background: linear-gradient(100deg, transparent, ${dark ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.7)"}, transparent); }`,
    html: `<div class="row">${sized(title, ts, "t")}<div class="space"><div class="cam"><div class="float">${sized(visual, vs, "v")}<div class="sweep"><div class="beam"></div></div></div></div></div></div>`,
    script: (at) => `const t = document.querySelector("#${id} .t [data-hf-part]");
const vis = document.querySelector("#${id} .v [data-hf-part]");
const float = document.querySelector("#${id} .float");
const cam = document.querySelector("#${id} .cam");
// The card the camera settles on: the first block inside the visual big enough to read as a card.
const sr = document.querySelector("#${id} .sc").getBoundingClientRect();
const fr = cam.getBoundingClientRect(), fa = fr.width * fr.height;
const card = q("*", vis).find((e) => { const r = e.getBoundingClientRect(), a = r.width * r.height; return a > fa * 0.06 && a < fa * 0.42 && (e.textContent || "").trim().length > 12; });
const cr = (card || vis).getBoundingClientRect();
const origin = (((cr.left + cr.width / 2 - fr.left) / fr.width) * 100).toFixed(1) + "% " + (((cr.top + cr.height / 2 - fr.top) / fr.height) * 100).toFixed(1) + "%";
const words = q('[data-hf="w"] > span', t);
if (words.length) tl.fromTo(words, { yPercent: 115 }, { yPercent: 0, duration: 0.8, ease: IN, stagger: Math.min(0.06, 0.6 / words.length) }, ${at(0.3)});
const rest = q(':scope > *', t).filter((el) => !el.querySelector('[data-hf="w"]') && !el.matches('[data-hf^="h"]'));
if (rest.length) tl.fromTo(rest, { y: 24, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.6, ease: IN, stagger: 0.1 }, ${at(0.9)});
tl.fromTo(float, { ${tilt}, z: -320, autoAlpha: 0 }, { ${rest}, z: 0, autoAlpha: 1, duration: 0.95, ease: IN }, ${at(0.2)});
tl.to(float, { ${drift}, duration: 3.8, ease: MOVE }, ${at(1.15)});
${
  travel
    ? `tl.fromTo(cam, { x: ${Math.round(travel / 2)} }, { x: ${-Math.round(travel / 2)}, duration: 4.4, ease: MOVE }, ${at(0.2)});`
    : `const zoom = card ? Math.min(${Math.round(W * 0.56)} / cr.width, ${Math.round(H * 0.5)} / cr.height, 2.4) : 1;
const dive = ${!stack} && zoom > 1.3;
if (dive) tl.to("#${id} .t", { autoAlpha: 0, x: ${flip ? 80 : -80}, duration: 0.5, ease: OUT }, ${at(2.3)});
tl.fromTo(cam, { scale: 1, x: 0, y: 0, transformOrigin: origin }, { scale: dive ? zoom : ${stack ? 1.06 : 1.14}, x: dive ? ${W / 2} - (cr.left + cr.width / 2 - sr.left) : 0, y: dive ? ${H / 2} - (cr.top + cr.height / 2 - sr.top) : 0, transformOrigin: origin, duration: dive ? 1.3 : 3.2, ease: MOVE }, dive ? ${at(2.3)} : ${at(1.3)});`
}
const blocks = q(':scope > * > *', vis).slice(0, 14);
if (blocks.length > 1) tl.fromTo(blocks, { y: 20, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.5, ease: IN, stagger: Math.min(0.08, 0.6 / blocks.length) }, ${at(0.7)});
countUp(vis, ${at(1.0)});
tl.fromTo("#${id} .sweep .beam", { xPercent: 0 }, { xPercent: 400, duration: 1.2, ease: MOVE }, ${at(1.6)});`,
  };
}

// Social proof: the site's own customer logo strip slides by, under its own label when it has one.
function logosScene(k: CloneKit, W: number, H: number): TrailerScene | null {
  const strip = get(k, "logos");
  if (!strip) return null;
  const s = Math.min((H * 0.12) / strip.h, 2.2);
  const travel = Math.max(0, strip.w * s - W * 0.9);
  return {
    id: "s-logos",
    label: "Social proof: real customer logos",
    dur: 3.4,
    enter: "whip",
    css: `${groundCss("s-logos", strip.ground)}
#s-logos .label { position: absolute; left: 0; right: 0; top: ${Math.round(H * 0.3)}px; text-align: center; font-size: ${H > W ? 44 : 40}px; letter-spacing: 0.02em; color: ${k.theme.muted}; }
#s-logos .lane { position: absolute; left: 0; right: 0; top: ${Math.round(H * 0.46)}px; display: flex; justify-content: center; }`,
    html: `${strip.title ? `<div class="label">${esc(strip.title)}</div>` : ""}<div class="lane">${sized(strip, s, "strip")}</div>`,
    script: (at) => `${strip.title ? `tl.fromTo("#s-logos .label", { y: 20, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.6, ease: IN }, ${at(0.2)});` : ""}
tl.fromTo("#s-logos .strip", { x: ${Math.round(travel / 2 + 120)}, autoAlpha: 0 }, { x: ${Math.round(travel / 2)}, autoAlpha: 1, duration: 0.7, ease: IN }, ${at(0.3)});
tl.to("#s-logos .strip", { x: ${-Math.round(travel / 2)}, duration: 2.4, ease: MOVE }, ${at(1.0)});`,
  };
}

// Pricing: the real plan cards land from depth, prices count up, the featured plan lifts.
function pricingScene(k: CloneKit, W: number, H: number): TrailerScene | null {
  const part = get(k, "pricing");
  if (!part) return null;
  const s = Math.min((W * 0.9) / part.w, (H * 0.78) / part.h, 1.6);
  return {
    id: "s-price",
    label: "Pricing: the real plans",
    dur: 5,
    enter: "whip",
    css: `${groundCss("s-price", part.ground)}
#s-price .space { position: absolute; inset: 0; perspective: 2000px; }`,
    html: `<div class="space">${placed(part, s)}</div>`,
    script: (at) => `const part = document.querySelector('#s-price [data-hf-part="pricing"]');
const cards = q(':scope > *', part);
tl.fromTo(cards, { z: -600, rotateX: 18, autoAlpha: 0 }, { z: 0, rotateX: 0, autoAlpha: 1, duration: 0.9, ease: IN, stagger: 0.14 }, ${at(0.3)});
countUp(part, ${at(0.9)});
tl.fromTo("#s-price .part-wrap", { scale: ${s.toFixed(3)} }, { scale: ${(s * 1.05).toFixed(3)}, duration: 4.6, ease: MOVE }, ${at(0.2)});`,
  };
}

export function buildTrailer(k: CloneKit, aspect: "16:9" | "9:16" = "16:9"): Trailer {
  const [W, H] = aspect === "9:16" ? [1080, 1920] : [1920, 1080];
  const sectionCount = k.parts.filter((p) => /^section-\d+$/.test(p.name)).length;
  const beats = Array.from({ length: Math.min(3, sectionCount) }, (_, i) => featureBeat(k, i + 1, W, H));
  const scenes = [
    logoScene(k, W, H),
    headlineScene(k, W, H),
    flyoverScene(k, W, H),
    featuresScene(k, W, H),
    ...beats,
    logosScene(k, W, H),
    pricingScene(k, W, H),
    closeScene(k, W, H),
  ].filter((s): s is TrailerScene => !!s);
  if (scenes[0]) scenes[0].enter = "cut";
  while (scenes.reduce((sum, s) => sum + s.dur, 0) > MAX_SECONDS && scenes.length > 3) scenes.splice(scenes.length - 2, 1);

  let t = 0;
  const timed = scenes.map((s, i) => {
    const start = t;
    t += s.dur;
    const last = i === scenes.length - 1;
    return { ...s, start, from: i === 0 ? 0 : start - OVERLAP, to: last ? t : start + s.dur + OVERLAP, index: i, last };
  });
  const duration = Math.round(t * 100) / 100;
  const files: Record<string, string> = {};
  const local = (x: number) => Math.max(0, x).toFixed(2);

  for (const s of timed) {
    const at = (x: number) => local(s.start - s.from + x - (s.index === 0 ? 0 : 0.35));
    const cutIn = s.start - s.from;
    const cutOut = s.start + s.dur - s.from;
    const next = timed[s.index + 1];
    // Whip: a fast lateral move with motion blur. Zoom: the old scene rushes past, the new one arrives.
    const seamIn =
      s.index === 0
        ? ""
        : s.enter === "zoom"
          ? `tl.fromTo("#${s.id} .sc", { scale: 0.82, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: ${OVERLAP + 0.15}, ease: EASE }, ${local(cutIn)});`
          : `tl.fromTo("#${s.id} .sc", { xPercent: 100, filter: "blur(18px)" }, { xPercent: 0, filter: "blur(0px)", duration: ${2 * OVERLAP}, ease: MOVE }, ${local(cutIn - OVERLAP)});`;
    const seamOut = !next
      ? ""
      : next.enter === "zoom"
        ? `tl.to("#${s.id} .sc", { scale: 1.4, autoAlpha: 0, filter: "blur(10px)", duration: ${OVERLAP}, ease: OUT }, ${local(cutOut - OVERLAP)});`
        : `tl.to("#${s.id} .sc", { xPercent: -100, filter: "blur(18px)", duration: ${2 * OVERLAP}, ease: MOVE }, ${local(cutOut - OVERLAP)});`;
    files[`compositions/${s.id}.html`] = `<!doctype html>
<html>
<head><meta charset="UTF-8" /><title>${esc(s.label)}</title></head>
<body>
<template>
<style>
#root { position: absolute; inset: 0; }
#${s.id} { position: absolute; inset: 0; overflow: hidden; }
#${s.id} .sc { position: absolute; inset: 0; overflow: hidden; font-family: ${k.theme.body ?? "system-ui, sans-serif"}; }
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
${RUNTIME}
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
    note: "Website trailer: whip-pans LEFT between scenes, a zoom-through (PUSH) into the closing call to action.",
    seams: timed.slice(1).map((s) => {
      const prev = timed[s.index - 1];
      const zoom = s.enter === "zoom";
      return {
        id: `${prev.id}->${s.id}`,
        cut: Math.round(s.start * 100) / 100,
        type: "cut",
        technique: zoom ? "zoom-through" : "whip-pan LEFT",
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
<title>${esc(k.url)} trailer</title>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
${k.fontCss}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: ${k.theme.bg}; }
#stage { position: relative; width: ${W}px; height: ${H}px; overflow: hidden; background: ${k.theme.bg}; color: ${k.theme.ink}; font-family: ${k.theme.body ?? "system-ui, sans-serif"}; }
#glow { position: absolute; inset: 0; background: radial-gradient(60% 50% at 50% 35%, ${k.theme.ink}${k.theme.dark ? "10" : "08"}, transparent 70%); }
</style>
</head>
<body>
<div id="stage" data-composition-id="main" data-start="0" data-duration="${duration}" data-fps="30" data-width="${W}" data-height="${H}">
  <div id="glow"></div>
${timed.map((s) => `  <div id="mount-${s.id}" data-composition-id="${s.id}" data-composition-src="compositions/${s.id}.html" data-start="${s.from.toFixed(2)}" data-duration="${(s.to - s.from).toFixed(2)}" data-track-index="${s.index + 1}" data-width="${W}" data-height="${H}"></div>`).join("\n")}
</div>
<script>
const tl = gsap.timeline({ paused: true });
tl.fromTo("#glow", { scale: 1, opacity: 0.6 }, { scale: 1.2, opacity: 1, duration: ${duration}, ease: "power1.inOut" }, 0);
window.__timelines["main"] = tl;
tl.seek(0);
</script>
</body>
</html>
`;
  return { files, ledger, duration, scenes: timed.map((s) => ({ id: s.id, label: s.label, start: s.start, dur: s.dur })) };
}
