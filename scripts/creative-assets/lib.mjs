// Shared helpers for the creative asset generator: theme tokens, seeded randomness, smooth paths.
//
// Theming contract (every creative SVG follows it):
//   Colors are CSS custom properties with a fallback, set in style="" attributes (never presentation
//   attributes, which can't read var()). Inline the SVG in a composition and set the variables on any
//   ancestor to recolor it; as an <img>, the fallbacks render (a dark-film default palette).
//     --ink        primary line / text      --surface   panels and grounds
//     --accent     brand highlight          --accent-2  second highlight
//     --accent-3   third highlight          --muted     secondary text, grid lines
//     --paper      light paper ground       --highlight marker yellow
//     --font       text inside mockups and titles (Inter is auto-resolved by HyperFrames)
//   Draw-on strokes carry class="draw", pathLength="1", stroke-dasharray "1 1.05": tween
//   stroke-dashoffset from 1.02 (hidden) to 0 (drawn).
//   Parts meant to animate separately carry ids/classes listed in each asset's description.
//   Every gradient/filter id is prefixed with the asset's id, so several assets can be inlined at once.

export const THEME = {
  ink: "#F5F3EE",
  surface: "#111216",
  accent: "#FF5A36",
  "accent-2": "#7B61FF",
  "accent-3": "#18C29C",
  muted: "#8B8F98",
  paper: "#F4EFE6",
  highlight: "#FFE14D",
};

export const c = (name, fallback) => `var(--${name},${fallback ?? THEME[name]})`;
export const FONT = "var(--font,Inter,system-ui,sans-serif)";
export const MONO = "var(--font-mono,'JetBrains Mono',ui-monospace,monospace)";

export const f = (n) => {
  const r = Math.round(n * 10) / 10;
  return Object.is(r, -0) ? "0" : String(r);
};

export function style(props) {
  return Object.entries(props)
    .filter(([, val]) => val !== undefined && val !== null && val !== false)
    .map(([k, val]) => `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}:${val}`)
    .join(";");
}

export const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function svg({ w, h, body, defs = "", title, slice = false }) {
  const aspect = slice ? ' preserveAspectRatio="xMidYMid slice"' : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"${aspect} role="img" aria-label="${esc(title)}">\n${defs ? `<defs>${defs}</defs>\n` : ""}${body}\n</svg>\n`;
}

// Deterministic randomness: the same asset id always produces the same geometry.
export function rng(seedText) {
  let h = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i++) {
    h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const range = (n) => Array.from({ length: n }, (_, i) => i);
export const lerp = (a, b, t) => a + (b - a) * t;

// Catmull-Rom through the points, as cubic Beziers.
export function smoothClosed(pts, tension = 1) {
  const n = pts.length;
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    d += ` C${f(p1[0] + ((p2[0] - p0[0]) / 6) * tension)} ${f(p1[1] + ((p2[1] - p0[1]) / 6) * tension)} ${f(p2[0] - ((p3[0] - p1[0]) / 6) * tension)} ${f(p2[1] - ((p3[1] - p1[1]) / 6) * tension)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return `${d}Z`;
}

export function smoothOpen(pts, tension = 1) {
  const n = pts.length;
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(i + 2, n - 1)];
    d += ` C${f(p1[0] + ((p2[0] - p0[0]) / 6) * tension)} ${f(p1[1] + ((p2[1] - p0[1]) / 6) * tension)} ${f(p2[0] - ((p3[0] - p1[0]) / 6) * tension)} ${f(p2[1] - ((p3[1] - p1[1]) / 6) * tension)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}

export const poly = (pts) => `M${pts.map((p) => `${f(p[0])} ${f(p[1])}`).join(" L")}Z`;
export const line = (pts) => `M${pts.map((p) => `${f(p[0])} ${f(p[1])}`).join(" L")}`;

// Hand-drawn feel: nudge every point a little, deterministically.
export function wobble(pts, seed, amp) {
  const r = rng(seed);
  return pts.map(([x, y]) => [x + (r() * 2 - 1) * amp, y + (r() * 2 - 1) * amp]);
}

// Organic closed shape around a center.
export function blobPath(cx, cy, radius, points, irregularity, seed) {
  const r = rng(seed);
  const pts = range(points).map((i) => {
    const a = (i / points) * Math.PI * 2;
    const rr = radius * (1 + irregularity * (r() * 2 - 1));
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
  });
  return smoothClosed(pts);
}

export function starPoints(cx, cy, outer, inner, spikes, rotation = -Math.PI / 2) {
  return range(spikes * 2).map((i) => {
    const a = rotation + (i / (spikes * 2)) * Math.PI * 2;
    const rr = i % 2 === 0 ? outer : inner;
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
  });
}

export function arcPath(cx, cy, r, startDeg, endDeg) {
  const a0 = ((startDeg - 90) * Math.PI) / 180;
  const a1 = ((endDeg - 90) * Math.PI) / 180;
  const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  const sweep = endDeg > startDeg ? 1 : 0;
  return `M${f(cx + r * Math.cos(a0))} ${f(cy + r * Math.sin(a0))} A${f(r)} ${f(r)} 0 ${large} ${sweep} ${f(cx + r * Math.cos(a1))} ${f(cy + r * Math.sin(a1))}`;
}

export const roundRect = (x, y, w, h, r) =>
  `M${f(x + r)} ${f(y)} H${f(x + w - r)} A${f(r)} ${f(r)} 0 0 1 ${f(x + w)} ${f(y + r)} V${f(y + h - r)} A${f(r)} ${f(r)} 0 0 1 ${f(x + w - r)} ${f(y + h)} H${f(x + r)} A${f(r)} ${f(r)} 0 0 1 ${f(x)} ${f(y + h - r)} V${f(y + r)} A${f(r)} ${f(r)} 0 0 1 ${f(x + r)} ${f(y)}Z`;

// A draw-on stroke (see the contract at the top).
export function drawStroke(d, { color = c("accent"), width = 8, id, cls = "", opacity, cap = "round" } = {}) {
  const s = style({ fill: "none", stroke: color, strokeWidth: width, strokeLinecap: cap, strokeLinejoin: "round", strokeDasharray: "1 1.05", strokeDashoffset: 0, opacity });
  return `<path${id ? ` id="${id}"` : ""} class="draw${cls ? ` ${cls}` : ""}" pathLength="1" d="${d}" style="${s}"/>`;
}

export function text(x, y, content, { size = 32, weight = 600, color = c("ink"), anchor = "start", id, cls, family = FONT, spacing, opacity, upper = false } = {}) {
  const s = style({ fontFamily: family, fontSize: `${size}px`, fontWeight: weight, fill: color, letterSpacing: spacing, opacity, textTransform: upper ? "uppercase" : undefined });
  return `<text${id ? ` id="${id}"` : ""}${cls ? ` class="${cls}"` : ""} x="${f(x)}" y="${f(y)}" text-anchor="${anchor}" style="${s}">${esc(content)}</text>`;
}

// Film grain / paper fibers as an SVG filter (deterministic: fixed seed).
export function noiseFilter(id, { freq = 0.9, octaves = 2, seed = 7, alpha = 0.55, type = "fractalNoise", mono = true } = {}) {
  const matrix = mono ? `0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 ${alpha} 0` : `1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${alpha} 0`;
  return `<filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="${type}" baseFrequency="${freq}" numOctaves="${octaves}" seed="${seed}" stitchTiles="stitch"/><feColorMatrix type="matrix" values="${matrix}"/></filter>`;
}

export const blurFilter = (id, sd) => `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${sd}"/></filter>`;

export function radial(id, stops, { cx = "50%", cy = "50%", r = "50%", fx, fy } = {}) {
  return `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}"${fx ? ` fx="${fx}"` : ""}${fy ? ` fy="${fy}"` : ""}>${stops.map(([o, col, op = 1]) => `<stop offset="${o}" style="stop-color:${col};stop-opacity:${op}"/>`).join("")}</radialGradient>`;
}

export function linear(id, stops, { x1 = "0", y1 = "0", x2 = "1", y2 = "0", units } = {}) {
  return `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${units ? ` gradientUnits="${units}"` : ""}>${stops.map(([o, col, op = 1]) => `<stop offset="${o}" style="stop-color:${col};stop-opacity:${op}"/>`).join("")}</linearGradient>`;
}
