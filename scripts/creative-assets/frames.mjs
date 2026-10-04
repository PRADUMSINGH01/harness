// Frames and containers (transparent): borders that hold a photo, a clip or a word. Openings are real
// holes (evenodd), so content goes BEHIND the frame at the opening's box, given in each description.
import { c, f, FONT, MONO, poly, range, rng, roundRect, svg, text } from "./lib.mjs";

const BASE = { kind: "frame" };
const pct = (n, of) => `${f((n / of) * 100)}%`;
const box = (x, y, w, h, W, H) => `left ${pct(x, W)}, top ${pct(y, H)}, width ${pct(w, W)}, height ${pct(h, H)}`;

export default [
  {
    ...BASE,
    stem: "film-strip",
    name: "Film strip",
    w: 1800,
    h: 420,
    tags: ["film strip", "35mm", "cinema", "gallery", "photos", "retro", "reel"],
    description: `35mm strip with sprocket holes and four windows (#window-1..4; window 1 at ${box(60, 80, 380, 260, 1800, 420)}, then every ${pct(430, 1800)} along x). Put photos behind the windows and slide the whole strip sideways for a gallery.`,
    svg: () => {
      const holes = range(30).flatMap((i) => [roundRect(20 + i * 60, 22, 30, 34, 6), roundRect(20 + i * 60, 364, 30, 34, 6)]);
      const windows = range(4).map((i) => roundRect(60 + i * 430, 80, 380, 260, 10));
      return svg({
        w: 1800,
        h: 420,
        title: "Film strip",
        body: `<path fill-rule="evenodd" d="M0 0 H1800 V420 H0Z ${holes.join(" ")} ${windows.join(" ")}" style="fill:${c("film", "#141414")}"/>${range(4)
          .map((i) => `<rect id="window-${i + 1}" x="${60 + i * 430}" y="80" width="380" height="260" rx="10" style="fill:none"/>`)
          .join("")}`,
      });
    },
  },
  {
    ...BASE,
    stem: "polaroid",
    name: "Instant photo frame",
    w: 600,
    h: 720,
    tags: ["polaroid", "instant photo", "photo", "memory", "scrapbook", "collage", "frame"],
    description: `White instant-photo border with a caption (<text id="caption">, handwritten feel). Photo opening: ${box(40, 40, 520, 520, 600, 720)}. Toss it in with a small rotation; pairs with tape-strip on a corner.`,
    svg: () =>
      svg({
        w: 600,
        h: 720,
        title: "Instant photo frame",
        body: `<path fill-rule="evenodd" d="M0 0 H600 V720 H0Z M40 40 V560 H560 V40Z" style="fill:${c("polaroid", "#FBFAF7")}"/>
${text(300, 650, "launch day", { size: 46, weight: 500, color: "#2B2B2B", anchor: "middle", id: "caption", family: "var(--font-hand,'Comic Relief','Comic Sans MS',cursive)" })}`,
      }),
  },
  {
    ...BASE,
    stem: "ticket",
    name: "Ticket",
    w: 1000,
    h: 400,
    tags: ["ticket", "event", "admission", "pass", "launch", "invite", "coupon"],
    description: "Ticket with notched sides, a perforation and a stub: <text id=\"title\">, \"subtitle\", \"stub\". For event, launch-date and invite beats.",
    svg: () => {
      const d = `M30 0 H970 a30 30 0 0 0 30 30 V160 a40 40 0 0 0 0 80 V370 a30 30 0 0 0 -30 30 H30 a30 30 0 0 0 -30 -30 V240 a40 40 0 0 0 0 -80 V30 a30 30 0 0 0 30 -30Z`;
      return svg({
        w: 1000,
        h: 400,
        title: "Ticket",
        body: `<path d="${d}" style="fill:${c("accent")}"/>
<path d="M740 30 V370" style="stroke:#fff;stroke-width:4;stroke-dasharray:4 14;stroke-linecap:round;opacity:0.7"/>
${text(70, 170, "LAUNCH PARTY", { size: 64, weight: 900, color: "#fff", id: "title", spacing: "2px" })}
${text(72, 240, "Oct 12 · Online · 6 PM", { size: 36, weight: 500, color: "#fff", id: "subtitle", opacity: 0.85 })}
<text id="stub" x="870" y="200" text-anchor="middle" transform="rotate(-90 870 200)" style="font-family:${MONO};font-size:34px;font-weight:700;fill:#fff;letter-spacing:4px">ADMIT ONE</text>`,
      });
    },
  },
  {
    ...BASE,
    stem: "torn-edge",
    name: "Torn paper edge strip",
    w: 1920,
    h: 180,
    tags: ["torn paper", "edge", "rip", "collage", "border", "craft", "divider"],
    description: "Full-width paper strip with a torn bottom edge (--paper). Pin it to the top of a scene (flip it with scaleY(-1) for the bottom) to give a photo or footage scene a collage border.",
    svg: () => {
      const r = rng("torn-edge");
      const edge = range(97).map((i) => [1920 - i * 20, 120 + Math.sin(i * 0.6) * 12 + r() * 30]);
      return svg({ w: 1920, h: 180, title: "Torn paper edge strip", body: `<path d="${poly([[0, 0], [1920, 0], ...edge])}" style="fill:${c("paper")}"/>` });
    },
  },
  {
    ...BASE,
    stem: "tape-strip",
    name: "Masking tape strip",
    w: 320,
    h: 100,
    tags: ["tape", "masking tape", "washi", "collage", "scrapbook", "sticky", "craft"],
    description: "Translucent masking tape with jagged ends. Stick it across a photo or card corner (rotate 20-40 degrees); land it with a quick press (scale 1.05 to 1).",
    svg: () => {
      const r = rng("tape");
      const left = range(9).map((i) => [10 + r() * 14, 90 - i * 10]);
      const right = range(9).map((i) => [296 + r() * 14, 10 + i * 10]);
      return svg({ w: 320, h: 100, title: "Masking tape strip", body: `<path d="${poly([[24, 10], ...right, [24, 90], ...left])}" style="fill:${c("tape", "#EADFC4")};opacity:0.82"/>` });
    },
  },
  {
    ...BASE,
    stem: "viewfinder",
    name: "Camera viewfinder (REC)",
    w: 1920,
    h: 1080,
    tags: ["viewfinder", "camera", "rec", "recording", "camcorder", "vlog", "hud", "overlay"],
    description: "Full-frame camera viewfinder: corner marks, center cross, #rec-dot with REC, <text id=\"timecode\">, battery. Lay it over footage for a 'live / behind the scenes' look; advance #timecode with the film's clock (not a wall clock) and blink #rec-dot on a fixed beat.",
    svg: () => {
      const s = `fill:none;stroke:#fff;stroke-width:5;stroke-linecap:square`;
      return svg({
        w: 1920,
        h: 1080,
        title: "Camera viewfinder",
        body: `<path d="M80 200 V80 H200 M1720 80 H1840 V200 M1840 880 V1000 H1720 M200 1000 H80 V880" style="${s}"/>
<path d="M940 540 H980 M960 520 V560" style="fill:none;stroke:#fff;stroke-width:3;opacity:0.8"/>
<circle id="rec-dot" cx="140" cy="146" r="16" style="fill:#FF2D2D"/>${text(172, 160, "REC", { size: 40, weight: 700, color: "#fff", family: MONO })}
${text(1840, 160, "00:00:12:08", { size: 40, weight: 600, color: "#fff", anchor: "end", id: "timecode", family: MONO })}
<path d="${roundRect(1700, 950, 90, 40, 6)} M1790 962 h8 v16 h-8" style="fill:none;stroke:#fff;stroke-width:4"/><rect x="1706" y="956" width="56" height="28" rx="3" style="fill:#fff"/>
${text(140, 990, "4K · 24fps", { size: 32, weight: 600, color: "#fff", family: MONO, opacity: 0.85 })}`,
      });
    },
  },
  {
    ...BASE,
    stem: "countdown",
    name: "Countdown ring",
    w: 600,
    h: 600,
    tags: ["countdown", "timer", "3 2 1", "intro", "launch", "ring", "number"],
    description: "Ring (#ring, pathLength=100) around a big <text id=\"number\">3</text>. For a 3-2-1: sweep #ring's dasharray from '100 100' to '0 100' each second and swap the number on the beat. Use only when the brief wants a countdown.",
    svg: () =>
      svg({
        w: 600,
        h: 600,
        title: "Countdown ring",
        body: `<circle cx="300" cy="300" r="250" style="fill:none;stroke:${c("ui-line", "#2C2F38")};stroke-width:20"/>
<circle id="ring" cx="300" cy="300" r="250" pathLength="100" transform="rotate(-90 300 300)" style="fill:none;stroke:${c("accent")};stroke-width:20;stroke-linecap:round;stroke-dasharray:100 100"/>
${text(300, 380, "3", { size: 240, weight: 900, color: c("ink"), anchor: "middle", id: "number" })}`,
      }),
  },
  {
    ...BASE,
    stem: "corner-marks",
    name: "Focus corner marks",
    w: 1200,
    h: 800,
    tags: ["corners", "focus", "frame", "selection", "crop", "highlight", "scan"],
    description: "Four L-shaped corner marks (#tl, #tr, #bl, #br) around a region. Resize by moving the corners; animate them from a larger box inward to 'lock onto' a UI region or product detail.",
    svg: () => {
      const s = `fill:none;stroke:${c("accent")};stroke-width:10;stroke-linecap:round`;
      return svg({
        w: 1200,
        h: 800,
        title: "Focus corner marks",
        body: `<path id="tl" d="M10 130 V10 H130" style="${s}"/><path id="tr" d="M1070 10 H1190 V130" style="${s}"/><path id="bl" d="M10 670 V790 H130" style="${s}"/><path id="br" d="M1070 790 H1190 V670" style="${s}"/>`,
      });
    },
  },
  {
    ...BASE,
    stem: "stamp",
    name: "Postage stamp frame",
    w: 520,
    h: 640,
    tags: ["stamp", "postage", "vintage", "collage", "badge", "craft", "travel"],
    description: `Perforated postage-stamp border. Image opening: ${box(50, 50, 420, 460, 520, 640)}; <text id="label"> sits under it. Collage and 'sealed / approved' moments.`,
    svg: () => {
      const bumps = [];
      for (let x = 20; x <= 500; x += 32) bumps.push(`M${x - 10} 0 a10 10 0 0 0 20 0`, `M${x - 10} 640 a10 10 0 0 1 20 0`);
      for (let y = 20; y <= 620; y += 32) bumps.push(`M0 ${y - 10} a10 10 0 0 1 0 20`, `M520 ${y - 10} a10 10 0 0 0 0 20`);
      return svg({
        w: 520,
        h: 640,
        title: "Postage stamp frame",
        body: `<path fill-rule="evenodd" d="M0 0 H520 V640 H0Z M50 50 V510 H470 V50Z ${bumps.join(" ")}" style="fill:${c("paper")}"/>
${text(260, 586, "FIRST CLASS", { size: 34, weight: 800, color: c("accent"), anchor: "middle", id: "label", spacing: "4px" })}`,
      });
    },
  },
  {
    ...BASE,
    stem: "story-frame",
    name: "Vertical story frame",
    w: 1080,
    h: 1920,
    tags: ["story", "vertical", "9:16", "reels", "shorts", "tiktok", "social", "progress"],
    description: "Platform-neutral 9:16 story chrome: segment progress bars (#seg-1..4; fill #seg-fill-1 with scaleX), avatar, <text id=\"name\">, \"time\", and a reply pill. Lay it over a vertical film for social-native framing; keep content clear of the top 220px and bottom 200px.",
    svg: () =>
      svg({
        w: 1080,
        h: 1920,
        title: "Vertical story frame",
        body: `${range(4)
          .map((i) => `<rect id="seg-${i + 1}" x="${40 + i * 252}" y="40" width="240" height="8" rx="4" style="fill:#fff;opacity:0.35"/>`)
          .join("")}<rect id="seg-fill-1" x="40" y="40" width="240" height="8" rx="4" style="fill:#fff;transform-box:fill-box;transform-origin:left"/>
<circle cx="90" cy="120" r="40" style="fill:${c("accent")};stroke:#fff;stroke-width:4"/>
${text(150, 132, "yourbrand", { size: 36, weight: 700, color: "#fff", id: "name" })}${text(352, 132, "2h", { size: 32, weight: 500, color: "#fff", id: "time", opacity: 0.7 })}
<rect x="40" y="1780" width="840" height="96" rx="48" style="fill:none;stroke:#fff;stroke-width:3;opacity:0.8"/>${text(90, 1840, "Send message", { size: 34, weight: 500, color: "#fff", opacity: 0.8 })}
<path d="M960 1828 c-18 -16 -34 -26 -34 -42 a17 17 0 0 1 34 -8 a17 17 0 0 1 34 8 c0 16 -16 26 -34 42z" style="fill:none;stroke:#fff;stroke-width:4"/>`,
      }),
  },
  {
    ...BASE,
    stem: "split-screen",
    name: "Split-screen divider",
    w: 1920,
    h: 1080,
    tags: ["split screen", "comparison", "before after", "versus", "two up", "divider"],
    description: "Center divider (#divider) with labels <text id=\"label-a\"> / \"label-b\" on chips. Lay over two half-width scenes; slide #divider for a before/after reveal.",
    svg: () =>
      svg({
        w: 1920,
        h: 1080,
        title: "Split-screen divider",
        body: `<rect id="divider" x="954" y="0" width="12" height="1080" style="fill:${c("ink")}"/>
<g id="chip-a"><rect x="60" y="60" width="240" height="72" rx="36" style="fill:#000;opacity:0.6"/>${text(180, 108, "BEFORE", { size: 32, weight: 800, color: "#fff", anchor: "middle", id: "label-a", spacing: "3px" })}</g>
<g id="chip-b"><rect x="1620" y="60" width="240" height="72" rx="36" style="fill:${c("accent")}"/>${text(1740, 108, "AFTER", { size: 32, weight: 800, color: "#fff", anchor: "middle", id: "label-b", spacing: "3px" })}</g>
<circle cx="960" cy="540" r="44" style="fill:${c("ink")}"/><path d="M944 524 L928 540 L944 556 M976 524 L992 540 L976 556" style="fill:none;stroke:${c("surface")};stroke-width:6;stroke-linecap:round;stroke-linejoin:round"/>`,
      }),
  },
  {
    ...BASE,
    stem: "cutout-card",
    name: "Magazine cutout card",
    w: 800,
    h: 560,
    tags: ["cutout", "collage", "magazine", "paper", "zine", "scrapbook", "card"],
    description: `Irregular hand-cut paper card with a drop shadow; image or text opening at ${box(70, 70, 660, 400, 800, 560)}. The collage look of 2026: stack two or three with small rotations.`,
    svg: (id) => {
      const r = rng("cutout");
      const jag = (x0, y0, x1, y1, n) => range(n).map((i) => [x0 + ((x1 - x0) * i) / n + (r() - 0.5) * 8, y0 + ((y1 - y0) * i) / n + (r() - 0.5) * 8]);
      const outline = [...jag(14, 20, 786, 10, 14), ...jag(786, 10, 790, 546, 10), ...jag(790, 546, 10, 550, 14), ...jag(10, 550, 14, 20, 10)];
      return svg({
        w: 800,
        h: 560,
        title: "Magazine cutout card",
        defs: `<filter id="${id}-sh" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="10" stdDeviation="10" flood-opacity="0.35"/></filter>`,
        body: `<path fill-rule="evenodd" d="${poly(outline)} M70 70 V470 H730 V70Z" style="fill:${c("paper")};filter:url(#${id}-sh)"/>`,
      });
    },
  },
];
