// The quick-template library. Every template is a 10s single-scene film: fixed choreography,
// brand-filled content, the shared end transition and lockup from kit.ts (7.5s on).
// Motion stays inside the motion-graphics gates: entries <= 0.9s, staggers <= 0.15s each and
// 0.5s total, four eases (IN, MOVE, OUT, EASE), no loops.
import { dims, esc, kit, plain, shell, words, type QuickSpec, type Template } from "./kit.ts";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { OWN_ASSETS } from "../assets/catalog.ts";

const icon = (id: string) => kit(`icons/${existsSync(join(OWN_ASSETS, "creative", "icons", `${id}.svg`)) ? id : "sparkles"}`);
const kicker = (s: QuickSpec) => `<div id="kicker"><span class="kdot"></span><span>${esc(s.copy.kicker)}</span></div>`;
const KICKER_CSS = `#kicker { display: flex; align-items: center; gap: 18px; font-size: 40px; font-weight: 600; letter-spacing: 0.22em; text-transform: uppercase; color: var(--accent-text); }
#kicker .kdot { width: 16px; height: 16px; border-radius: 50%; background: var(--accent); }`;

const kineticHero: Template = {
  id: "kinetic-hero",
  label: "Kinetic hero",
  description: "Type-led: the headline rises word by word through masks, a doodle underline draws under it, then three feature chips land and light up in sequence.",
  needs: ["features"],
  build(spec) {
    const v = spec.aspect === "9:16";
    const chips = spec.copy.features
      .slice(0, 3)
      .map((f, i) => `<div class="chip" id="chip-${i + 1}"><span class="ic">${icon(f.icon)}</span><span>${esc(f.title)}</span></div>`)
      .join("");
    return {
      html: shell(spec, {
        title: plain(spec.copy.headline),
        css: `${KICKER_CSS}
#scene { gap: 36px; padding: 0 ${v ? 70 : 160}px; }
#headline { margin: 0; font-size: ${v ? 112 : 132}px; line-height: 1.04; font-weight: 700; letter-spacing: -0.035em; max-width: ${v ? 940 : 1600}px; }
#under { width: ${v ? 620 : 760}px; height: ${v ? 94 : 114}px; margin-top: -18px; }
#under svg { width: 100%; height: 100%; }
#sub { margin: 0; font-size: 44px; color: var(--muted-text); max-width: ${v ? 900 : 1300}px; }
#chips { display: flex; flex-direction: ${v ? "column" : "row"}; gap: 26px; margin-top: 30px; }
.chip { display: flex; align-items: center; gap: 18px; font-size: 40px; font-weight: 600; padding: 20px 34px; border-radius: 999px; background: var(--surface); border: 2px solid transparent; }
.chip .ic { width: 52px; height: 52px; } .chip .ic svg { width: 100%; height: 100%; --ink: var(--accent); }`,
        body: `  <div id="scene" class="center">
    ${kicker(spec)}
    <h1 id="headline">${words(spec.copy.headline)}</h1>
    <div id="under">${kit("doodles/underline-swoosh", 'preserveAspectRatio="none"')}</div>
    <p id="sub">${esc(spec.copy.subline)}</p>
    <div id="chips">${chips}</div>
  </div>`,
        script: `tl.fromTo("#kicker", { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: IN }, 0.3);
tl.fromTo("#headline .w > span", { yPercent: 130 }, { yPercent: 0, duration: 0.7, ease: IN, stagger: 0.08 }, 0.6);
tl.fromTo("#under .draw", { strokeDashoffset: 1.02 }, { strokeDashoffset: 0, duration: 0.6, ease: EASE }, 1.5);
tl.fromTo("#sub", { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: IN }, 2.0);
tl.fromTo(".chip", { autoAlpha: 0, y: 40, scale: 0.92 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.5, ease: IN, stagger: 0.12 }, 3.0);
tl.fromTo(".chip .draw", { strokeDashoffset: 1.02 }, { strokeDashoffset: 0, duration: 0.6, ease: EASE, stagger: 0.12 }, 3.2);
// Sequenced life: focus steps across the chips, then the whole scene pushes in toward the exit.
["#chip-1", "#chip-2", "#chip-3"].forEach((sel, i) => {
  tl.to(sel, { borderColor: "${spec.palette.accent}", y: -8, duration: 0.3, ease: EASE }, 4.4 + i * 0.7);
  tl.to(sel, { borderColor: "rgba(0,0,0,0)", y: 0, duration: 0.3, ease: EASE }, 4.4 + i * 0.7 + 0.6);
});
tl.fromTo("#scene", { scale: 1 }, { scale: 1.05, duration: 2.0, ease: MOVE }, 5.5);`,
      }),
    };
  },
};

const productShowcase: Template = {
  id: "product-showcase",
  label: "Product showcase",
  description: "The real screenshot in a browser frame: the camera pushes in, the page scrolls, a cursor travels to it, clicks, and a callout pops beside the headline.",
  needs: ["screenshot"],
  build(spec) {
    const v = spec.aspect === "9:16";
    const { W } = dims(spec.aspect);
    const fw = v ? 960 : 1000;
    const fh = Math.round(fw * 0.625);
    return {
      html: shell(spec, {
        title: plain(spec.copy.headline),
        css: `${KICKER_CSS}
#scene { position: absolute; inset: 0; }
#copy { position: absolute; ${v ? "left: 60px; right: 60px; top: 200px; align-items: center; text-align: center;" : "left: 120px; top: 0; bottom: 0; width: 640px; justify-content: center;"} display: flex; flex-direction: column; gap: 30px; }
#headline { margin: 0; font-size: ${v ? 104 : 96}px; line-height: 1.04; font-weight: 700; letter-spacing: -0.035em; }
#sub { margin: 0; font-size: 42px; color: var(--muted-text); }
#device { position: absolute; width: ${fw}px; height: ${fh}px; ${v ? `left: ${(W - fw) / 2}px; top: 900px;` : "left: 840px; top: 252px;"} }
#device .frame, #device .frame svg { position: absolute; inset: 0; width: 100%; height: 100%; }
#device .shot { position: absolute; left: 0; right: 0; top: 8.8%; bottom: 0; border-radius: 0 0 ${Math.round(fw * 0.014)}px ${Math.round(fw * 0.014)}px; background-image: url('${esc(spec.media.screenshot ?? "")}'); background-size: 100% auto; background-position: 50% 0%; background-repeat: no-repeat; background-color: var(--surface); }
#device .glow { position: absolute; inset: -60px; border-radius: 60px; background: var(--accent); opacity: 0.18; filter: blur(60px); }
#cursor { position: absolute; width: 64px; height: 80px; left: 0; top: 0; }
#cursor svg, #ripple svg { width: 100%; height: 100%; }
#ripple { position: absolute; width: 160px; height: 160px; margin: -80px 0 0 -80px; }
#callout { position: absolute; font-size: 40px; font-weight: 700; padding: 18px 34px; border-radius: 22px; background: var(--ink); color: var(--bg); white-space: nowrap; }`,
        body: `  <div id="scene">
    <div id="copy">
      ${kicker(spec)}
      <h1 id="headline">${words(spec.copy.headline)}</h1>
      <p id="sub">${esc(spec.copy.subline)}</p>
    </div>
    <div id="device">
      <div class="glow"></div>
      <div class="frame">${kit("mockups/browser-dark").replace(">yourproduct.com<", `>${esc(spec.brand.url ?? "")}<`).replace("font-size:22px", "font-size:40px")}</div>
      <div class="shot"></div>
      <div id="ripple">${kit("mockups/click-ripple")}</div>
      <div id="callout">${esc(spec.copy.callout)}</div>
      <div id="cursor">${kit("mockups/cursor-arrow")}</div>
    </div>
  </div>`,
        script: `const fw = ${fw}, fh = ${fh};
const target = { x: fw * 0.62, y: fh * 0.58 };
tl.set("#ripple", { left: target.x, top: target.y, autoAlpha: 0 }, 0);
tl.set("#callout", { left: target.x + 40, top: target.y - 130, autoAlpha: 0 }, 0);
tl.fromTo("#kicker", { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: IN }, 0.3);
tl.fromTo("#headline .w > span", { yPercent: 130 }, { yPercent: 0, duration: 0.7, ease: IN, stagger: 0.08 }, 0.6);
tl.fromTo("#sub", { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: IN }, 1.6);
tl.fromTo("#device", { autoAlpha: 0, y: 120, scale: 0.94 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.9, ease: IN }, 0.9);
// The page scrolls like a real visit, then the camera pushes toward the click.
tl.fromTo("#device .shot", { backgroundPosition: "50% 0%" }, { backgroundPosition: "50% 22%", duration: 2.2, ease: MOVE }, 2.0);
tl.fromTo("#cursor", { x: fw * 0.9, y: fh * 0.92, autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2, ease: EASE }, 3.6);
tl.to("#cursor", { x: target.x - 6, y: target.y - 4, duration: 1.1, ease: MOVE }, 3.7);
tl.to("#cursor", { scale: 0.86, duration: 0.12, ease: EASE, transformOrigin: "10% 5%" }, 4.85);
tl.to("#cursor", { scale: 1, duration: 0.18, ease: EASE }, 4.97);
tl.fromTo("#ripple", { autoAlpha: 1, scale: 0.3 }, { scale: 1.1, duration: 0.6, ease: EASE }, 4.85);
tl.to("#ripple", { autoAlpha: 0, duration: 0.3, ease: EASE }, 5.3);
tl.fromTo("#callout", { autoAlpha: 0, y: 30, scale: 0.9 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.5, ease: IN }, 5.05);
tl.to("#device", { scale: 1.07, duration: 2.3, ease: MOVE, transformOrigin: "100% 58%" }, 5.1);`,
      }),
    };
  },
};

const featureGrid: Template = {
  id: "feature-grid",
  label: "Feature grid",
  description: "Headline on top, three feature cards land in a grid, their icons draw themselves on, then a focus sweep lifts each card in turn.",
  needs: ["features"],
  build(spec) {
    const v = spec.aspect === "9:16";
    const cards = spec.copy.features
      .slice(0, 3)
      .map((f, i) => `<div class="card" id="card-${i + 1}"><div class="ic">${icon(f.icon)}</div><div class="title">${esc(f.title)}</div><div class="cbar"></div></div>`)
      .join("");
    return {
      html: shell(spec, {
        title: plain(spec.copy.headline),
        css: `${KICKER_CSS}
#scene { gap: ${v ? 56 : 70}px; padding: 0 ${v ? 70 : 140}px; }
#head { display: flex; flex-direction: column; align-items: center; gap: 28px; }
#headline { margin: 0; font-size: ${v ? 100 : 104}px; line-height: 1.05; font-weight: 700; letter-spacing: -0.03em; max-width: ${v ? 940 : 1600}px; }
#cards { display: flex; flex-direction: ${v ? "column" : "row"}; gap: 34px; }
.card { width: ${v ? 860 : 480}px; padding: ${v ? "38px 44px" : "48px 44px"}; border-radius: 34px; background: var(--surface); display: flex; flex-direction: ${v ? "row" : "column"}; align-items: ${v ? "center" : "flex-start"}; gap: 28px; text-align: left; position: relative; overflow: hidden; }
.card .ic { width: 110px; height: 110px; border-radius: 28px; background: var(--bg); padding: 22px; flex: none; }
.card .ic svg { width: 100%; height: 100%; --ink: var(--accent); }
.card .title { font-size: 48px; font-weight: 700; letter-spacing: -0.01em; }
.card .cbar { position: absolute; left: 0; bottom: 0; height: 8px; width: 100%; background: var(--accent); transform-origin: 0 50%; }
#sub { margin: 0; font-size: 42px; color: var(--muted-text); }`,
        body: `  <div id="scene" class="center">
    <div id="head">${kicker(spec)}<h1 id="headline">${words(spec.copy.headline)}</h1></div>
    <div id="cards">${cards}</div>
    <p id="sub">${esc(spec.copy.subline)}</p>
  </div>`,
        script: `tl.fromTo("#kicker", { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: IN }, 0.3);
tl.fromTo("#headline .w > span", { yPercent: 130 }, { yPercent: 0, duration: 0.7, ease: IN, stagger: 0.08 }, 0.6);
tl.set(".card .cbar", { scaleX: 0 }, 0);
tl.fromTo(".card", { autoAlpha: 0, y: 80 }, { autoAlpha: 1, y: 0, duration: 0.7, ease: IN, stagger: 0.14 }, 1.7);
tl.fromTo(".card .draw", { strokeDashoffset: 1.02 }, { strokeDashoffset: 0, duration: 0.8, ease: EASE, stagger: 0.14 }, 2.2);
tl.fromTo("#sub", { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: IN }, 3.3);
["#card-1", "#card-2", "#card-3"].forEach((sel, i) => {
  const at = 4.2 + i * 0.9;
  tl.to(sel, { y: -16, duration: 0.35, ease: EASE }, at);
  tl.to(sel + " .cbar", { scaleX: 1, duration: 0.6, ease: MOVE }, at);
  tl.to(sel, { y: 0, duration: 0.35, ease: EASE }, at + 0.7);
});
tl.fromTo("#scene", { scale: 1 }, { scale: 1.04, duration: 1.6, ease: MOVE }, 5.9);`,
      }),
    };
  },
};

const statPunch: Template = {
  id: "stat-punch",
  label: "Stat punch",
  description: "A real number counts up inside a progress ring, its label lands, then the headline arrives beneath while the stat steps back.",
  needs: ["stat"],
  build(spec) {
    const v = spec.aspect === "9:16";
    const stat = spec.copy.stat!;
    const decimals = Math.min(2, (String(stat.value).split(".")[1] ?? "").length);
    const finalText = `${stat.prefix ?? ""}${stat.value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${stat.suffix ?? ""}`;
    const ring = v ? 760 : 620;
    const valueSize = Math.round(Math.min(v ? 210 : 180, (ring * 0.72) / (finalText.length * 0.6)));
    return {
      html: shell(spec, {
        title: plain(spec.copy.headline),
        css: `${KICKER_CSS}
#scene { gap: 40px; padding: 0 ${v ? 70 : 160}px; }
#statbox { position: relative; width: ${v ? 760 : 620}px; height: ${v ? 760 : 620}px; display: flex; align-items: center; justify-content: center; }
#statbox svg.ring { position: absolute; inset: 0; width: 100%; height: 100%; }
#value { font-size: ${valueSize}px; font-weight: 800; letter-spacing: -0.05em; line-height: 1; }
#label { font-size: 44px; color: var(--muted-text); font-weight: 600; }
#headline { margin: 0; font-size: ${v ? 96 : 92}px; line-height: 1.05; font-weight: 700; letter-spacing: -0.03em; max-width: ${v ? 940 : 1500}px; }`,
        body: `  <div id="scene" class="center">
    ${kicker(spec)}
    <div id="statbox">
      <svg class="ring" viewBox="0 0 400 400"><circle cx="200" cy="200" r="180" style="fill:none;stroke:var(--surface);stroke-width:18"/><circle id="arc" cx="200" cy="200" r="180" pathLength="100" transform="rotate(-90 200 200)" style="fill:none;stroke:var(--accent);stroke-width:18;stroke-linecap:round;stroke-dasharray:0 100"/></svg>
      <div id="value">${esc(stat.prefix ?? "")}0${esc(stat.suffix ?? "")}</div>
    </div>
    <div id="label">${esc(stat.label)}</div>
    <h1 id="headline">${words(spec.copy.headline)}</h1>
  </div>`,
        script: `const counter = { v: 0 };
const fmt = (n) => "${esc(stat.prefix ?? "")}" + n.toLocaleString("en-US", { minimumFractionDigits: ${decimals}, maximumFractionDigits: ${decimals} }) + "${esc(stat.suffix ?? "")}";
const valueEl = document.getElementById("value");
tl.fromTo("#kicker", { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: IN }, 0.2);
tl.fromTo("#statbox", { autoAlpha: 0, scale: 0.85 }, { autoAlpha: 1, scale: 1, duration: 0.8, ease: IN }, 0.4);
tl.fromTo(counter, { v: 0 }, { v: ${stat.value}, duration: 1.8, ease: EASE, onUpdate: () => { valueEl.textContent = fmt(counter.v); } }, 0.7);
tl.fromTo("#arc", { strokeDasharray: "0 100" }, { strokeDasharray: "82 100", duration: 1.8, ease: EASE }, 0.7);
tl.fromTo("#label", { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: IN }, 2.4);
tl.fromTo("#headline .w > span", { yPercent: 130 }, { yPercent: 0, duration: 0.7, ease: IN, stagger: 0.08 }, 3.4);
// The stat steps back as the claim lands, then the ring completes its sweep.
tl.to("#statbox", { scale: 0.86, duration: 1.2, ease: MOVE }, 3.4);
tl.to("#arc", { strokeDasharray: "100 100", duration: 1.6, ease: MOVE }, 4.8);
tl.fromTo("#scene", { scale: 1 }, { scale: 1.05, duration: 2.2, ease: MOVE }, 5.3);`,
      }),
    };
  },
};

export const TEMPLATES: Template[] = [kineticHero, productShowcase, featureGrid, statPunch];
export const getTemplate = (id: string) => TEMPLATES.find((t) => t.id === id);
