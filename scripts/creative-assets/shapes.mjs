// Decorative shapes (transparent): organic blobs, bursts, sparkles, Bauhaus primitives, soft-3D objects.
import { blobPath, blurFilter, c, drawStroke, f, linear, poly, radial, range, rng, roundRect, smoothClosed, smoothOpen, starPoints, style, svg } from "./lib.mjs";

const BASE = { kind: "shape" };

const blob = (n, seed, fill, extra = {}) => ({
  ...BASE,
  w: 512,
  h: 512,
  stem: `blob-${n}`,
  name: `Organic blob ${n}`,
  tags: ["blob", "organic", "fluid", "shape", "abstract", "soft", ...(extra.tags ?? [])],
  description:
    extra.description ??
    "Organic blob for backdrops behind type, avatars and product shots. Morph between blob-01..06 with a path-morph adapter or just scale/rotate it in with the scene; parts: #shape.",
  svg: (id) =>
    svg({
      w: 512,
      h: 512,
      title: `Organic blob ${n}`,
      defs: linear(`${id}-g`, [["0", c("accent")], ["1", c("accent-2")]], { x1: "0", y1: "0", x2: "1", y2: "1" }),
      body: `<path id="shape" d="${blobPath(256, 256, 200, 9, 0.2, seed)}" style="${fill(id)}"/>`,
    }),
});

export default [
  blob("01", "blob-a", (id) => `fill:url(#${id}-g)`),
  blob("02", "blob-b", (id) => `fill:url(#${id}-g)`),
  blob("03", "blob-c", (id) => `fill:url(#${id}-g)`),
  blob("04", "blob-d", () => `fill:${c("accent")}`, { tags: ["solid"] }),
  blob("05", "blob-e", () => `fill:none;stroke:${c("ink")};stroke-width:6`, { tags: ["outline", "line"], description: "Outline-only organic blob (--ink stroke). Frame a portrait or a word; draws on if you give it the draw-on dash treatment." }),
  blob("06", "blob-f", () => `fill:${c("accent-2")};opacity:0.35`, { tags: ["translucent", "backdrop"] }),
  {
    ...BASE,
    w: 512,
    h: 512,
    stem: "squircle",
    name: "Squircle",
    tags: ["squircle", "superellipse", "app icon", "rounded", "container", "shape"],
    description: "Superellipse (iOS-style) container in --accent. Backplate for an icon or emoji; scale in with a slight overshoot.",
    svg: () => {
      const pts = range(72).map((i) => {
        const a = (i / 72) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        return [256 + 220 * Math.sign(ca) * Math.pow(Math.abs(ca), 0.4), 256 + 220 * Math.sign(sa) * Math.pow(Math.abs(sa), 0.4)];
      });
      return svg({ w: 512, h: 512, title: "Squircle", body: `<path id="shape" d="${poly(pts)}" style="fill:${c("accent")}"/>` });
    },
  },
  {
    ...BASE,
    w: 512,
    h: 512,
    stem: "starburst",
    name: "Starburst badge",
    tags: ["starburst", "burst", "badge", "sale", "sticker", "pop", "seal"],
    description: "24-point starburst seal in --accent. Put a word or price on it; pop it in with scale 0 to 1 and a small rotation.",
    svg: () => svg({ w: 512, h: 512, title: "Starburst badge", body: `<path id="shape" d="${poly(starPoints(256, 256, 240, 206, 24))}" style="fill:${c("accent")}"/>` }),
  },
  {
    ...BASE,
    w: 256,
    h: 256,
    stem: "sparkle",
    name: "Four-point sparkle",
    tags: ["sparkle", "twinkle", "star", "ai", "magic", "shine", "glint"],
    description: "Concave four-point sparkle in --ink: the universal 'AI / magic / new' glint. One-shot it: scale 0 to 1 with a 45-degree turn, then hold or exit; never loop a twinkle.",
    svg: () =>
      svg({
        w: 256,
        h: 256,
        title: "Four-point sparkle",
        body: `<path id="shape" d="M128 8 C138 90 166 118 248 128 C166 138 138 166 128 248 C118 166 90 138 8 128 C90 118 118 90 128 8Z" style="fill:${c("ink")}"/>`,
      }),
  },
  {
    ...BASE,
    w: 512,
    h: 512,
    stem: "sparkle-cluster",
    name: "Sparkle cluster",
    tags: ["sparkle", "cluster", "ai", "magic", "shine", "glint", "new"],
    description: "Three sparkles of different sizes (#s1 large in --ink, #s2 and #s3 in --accent). Stagger them in 0.08s apart beside a headline or product.",
    svg: () => {
      const sp = (cx, cy, r) => `M${cx} ${cy - r} C${f(cx + r * 0.08)} ${f(cy - r * 0.35)} ${f(cx + r * 0.35)} ${f(cy - r * 0.08)} ${cx + r} ${cy} C${f(cx + r * 0.35)} ${f(cy + r * 0.08)} ${f(cx + r * 0.08)} ${f(cy + r * 0.35)} ${cx} ${cy + r} C${f(cx - r * 0.08)} ${f(cy + r * 0.35)} ${f(cx - r * 0.35)} ${f(cy + r * 0.08)} ${cx - r} ${cy} C${f(cx - r * 0.35)} ${f(cy - r * 0.08)} ${f(cx - r * 0.08)} ${f(cy - r * 0.35)} ${cx} ${cy - r}Z`;
      return svg({
        w: 512,
        h: 512,
        title: "Sparkle cluster",
        body: `<path id="s1" d="${sp(220, 290, 170)}" style="fill:${c("ink")}"/><path id="s2" d="${sp(400, 120, 80)}" style="fill:${c("accent")}"/><path id="s3" d="${sp(410, 420, 46)}" style="fill:${c("accent")}"/>`,
      });
    },
  },
  {
    ...BASE,
    w: 512,
    h: 512,
    stem: "ring",
    name: "Thick ring",
    tags: ["ring", "circle", "donut", "outline", "geometric", "halo"],
    description: "Thick --accent ring. A halo behind an avatar, icon or number; draw it on (it carries the draw-on dash) or scale it in.",
    svg: () => svg({ w: 512, h: 512, title: "Thick ring", body: drawStroke("M256 56 A200 200 0 1 1 255.9 56", { width: 56, id: "shape", cap: "butt" }) }),
  },
  {
    ...BASE,
    w: 600,
    h: 200,
    stem: "pill",
    name: "Gradient pill",
    tags: ["pill", "capsule", "button", "tag", "gradient", "label"],
    description: "Capsule with an --accent to --accent-2 gradient: backplate for a label, CTA or keyword. Text goes on top as HTML.",
    svg: (id) => svg({ w: 600, h: 200, title: "Gradient pill", defs: linear(`${id}-g`, [["0", c("accent")], ["1", c("accent-2")]]), body: `<rect id="shape" x="4" y="4" width="592" height="192" rx="96" style="fill:url(#${id}-g)"/>` }),
  },
  {
    ...BASE,
    w: 512,
    h: 512,
    stem: "hexagon",
    name: "Rounded hexagon",
    tags: ["hexagon", "hex", "honeycomb", "tech", "web3", "badge", "geometric"],
    description: "Soft-cornered hexagon in --accent-2. Badges, honeycomb grids and node diagrams.",
    svg: () => {
      const pts = range(6).map((i) => {
        const a = -Math.PI / 2 + (i / 6) * Math.PI * 2;
        return [256 + Math.cos(a) * 230, 256 + Math.sin(a) * 230];
      });
      return svg({ w: 512, h: 512, title: "Rounded hexagon", body: `<path id="shape" d="${poly(pts)}" style="fill:${c("accent-2")};stroke:${c("accent-2")};stroke-width:40;stroke-linejoin:round"/>` });
    },
  },
  {
    ...BASE,
    w: 600,
    h: 300,
    stem: "arrow-chunky",
    name: "Chunky arrow",
    tags: ["arrow", "direction", "next", "pointer", "bold", "flat"],
    description: "Bold flat arrow pointing right in --accent. Rotate it for any direction; slide it in along its own axis (the vector law: it moves where it points).",
    svg: () => svg({ w: 600, h: 300, title: "Chunky arrow", body: `<path id="shape" d="M20 105 H360 V30 L580 150 L360 270 V195 H20Z" style="fill:${c("accent")};stroke:${c("accent")};stroke-width:24;stroke-linejoin:round"/>` }),
  },
  {
    ...BASE,
    w: 600,
    h: 200,
    stem: "chevrons",
    name: "Triple chevrons",
    tags: ["chevrons", "arrows", "forward", "next", "speed", "direction"],
    description: "Three chevrons (#c1, #c2, #c3) pointing right. Stagger their opacity 0.06s apart, left to right, to say 'forward / next'.",
    svg: () =>
      svg({
        w: 600,
        h: 200,
        title: "Triple chevrons",
        body: [0, 1, 2]
          .map((i) => `<path id="c${i + 1}" d="M${60 + i * 170} 30 L${160 + i * 170} 100 L${60 + i * 170} 170" style="fill:none;stroke:${c("accent")};stroke-width:34;stroke-linecap:round;stroke-linejoin:round;opacity:${f(0.45 + i * 0.27)}"/>`)
          .join(""),
      }),
  },
  {
    ...BASE,
    w: 512,
    h: 512,
    stem: "plus-marks",
    name: "Plus-mark field",
    tags: ["plus", "cross", "marks", "pattern", "swiss", "tech", "decoration"],
    description: "A 5x5 field of small plus marks in --muted (each .mark). Swiss/tech decoration in a corner; stagger the marks in from one corner.",
    svg: () => {
      const marks = [];
      for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) marks.push(`<path class="mark" d="M${56 + x * 100} ${40 + y * 100} v32 M${40 + x * 100} ${56 + y * 100} h32" style="fill:none;stroke:${c("muted")};stroke-width:5;stroke-linecap:round"/>`);
      return svg({ w: 512, h: 512, title: "Plus-mark field", body: marks.join("") });
    },
  },
  {
    ...BASE,
    w: 1200,
    h: 800,
    stem: "confetti",
    name: "Confetti pieces",
    tags: ["confetti", "celebration", "party", "launch", "success", "burst", "particles"],
    description: "48 confetti pieces (each .piece) in the accent palette, scattered over 1200x800. For a launch or success beat: animate pieces from the center outward (seeded, staggered) and let gravity pull them down once; never loop.",
    svg: () => {
      const r = rng("confetti");
      const cols = [c("accent"), c("accent-2"), c("accent-3"), c("highlight"), c("ink")];
      const pieces = range(48)
        .map((i) => {
          const x = 60 + r() * 1080;
          const y = 60 + r() * 680;
          const rot = f(r() * 360);
          const col = cols[i % cols.length];
          const t = i % 3;
          const shape =
            t === 0
              ? `<rect x="-20" y="-10" width="40" height="20" rx="3"/>`
              : t === 1
                ? `<circle r="13"/>`
                : `<path d="M-26 0 q13 -16 26 0 t26 0" style="fill:none;stroke:${col};stroke-width:8;stroke-linecap:round"/>`;
          return `<g class="piece" transform="translate(${f(x)} ${f(y)}) rotate(${rot})" style="fill:${col}">${shape}</g>`;
        })
        .join("");
      return svg({ w: 1200, h: 800, title: "Confetti pieces", body: pieces });
    },
  },
  {
    ...BASE,
    w: 512,
    h: 512,
    stem: "orb-3d",
    name: "Soft 3D orb",
    tags: ["orb", "sphere", "3d", "glossy", "ai", "hybrid", "depth", "ball"],
    description: "Glossy sphere built from layered gradients (--accent-2 body, --accent rim light): the flat-plus-soft-3D hybrid look. AI assistants, 'core' concepts, a planet; parts #body, #rim, #gloss.",
    svg: (id) =>
      svg({
        w: 512,
        h: 512,
        title: "Soft 3D orb",
        defs: `${radial(`${id}-body`, [["0", c("orb-light", "#B9A8FF")], ["0.55", c("accent-2")], ["1", c("orb-dark", "#1E1550")]], { cx: "38%", cy: "32%", r: "75%" })}${radial(`${id}-rim`, [["0.7", c("accent"), 0], ["1", c("accent"), 0.85]], { cx: "62%", cy: "70%", r: "60%" })}${radial(`${id}-gloss`, [["0", "#fff", 0.9], ["1", "#fff", 0]])}${blurFilter(`${id}-sh`, 18)}`,
        body: `<ellipse cx="256" cy="478" rx="150" ry="18" style="fill:#000;opacity:0.35;filter:url(#${id}-sh)"/>
<circle id="body" cx="256" cy="246" r="200" style="fill:url(#${id}-body)"/>
<circle id="rim" cx="256" cy="246" r="200" style="fill:url(#${id}-rim)"/>
<ellipse id="gloss" cx="196" cy="160" rx="78" ry="48" transform="rotate(-30 196 160)" style="fill:url(#${id}-gloss)"/>`,
      }),
  },
  {
    ...BASE,
    w: 512,
    h: 512,
    stem: "cube-3d",
    name: "Isometric cube",
    tags: ["cube", "isometric", "3d", "block", "box", "stack", "data"],
    description: "Isometric cube with three shaded faces (#top --ink-ish, #left --accent, #right darker). Stack several for data/infra stories; drop them in along -y.",
    svg: () => {
      const cx = 256;
      const top = [
        [cx, 70],
        [cx + 180, 160],
        [cx, 250],
        [cx - 180, 160],
      ];
      const left = [
        [cx - 180, 160],
        [cx, 250],
        [cx, 450],
        [cx - 180, 360],
      ];
      const right = [
        [cx + 180, 160],
        [cx, 250],
        [cx, 450],
        [cx + 180, 360],
      ];
      return svg({
        w: 512,
        h: 512,
        title: "Isometric cube",
        body: `<path id="top" d="${poly(top)}" style="fill:${c("cube-top", "#FFB199")}"/><path id="left" d="${poly(left)}" style="fill:${c("accent")}"/><path id="right" d="${poly(right)}" style="fill:${c("cube-shade", "#B8341A")}"/>`,
      });
    },
  },
  {
    ...BASE,
    w: 800,
    h: 500,
    stem: "glass-panel",
    name: "Glass panel",
    tags: ["glass", "glassmorphism", "frosted", "card", "panel", "premium", "ui"],
    description: "Frosted-glass card: translucent fill, gradient hairline border, top sheen. Sits over aurora/bokeh grounds; for real frosting add CSS backdrop-filter: blur(24px) on an HTML box of the same size behind it.",
    svg: (id) =>
      svg({
        w: 800,
        h: 500,
        title: "Glass panel",
        defs: `${linear(`${id}-edge`, [["0", "#fff", 0.55], ["0.5", "#fff", 0.08], ["1", "#fff", 0.3]], { x1: "0", y1: "0", x2: "1", y2: "1" })}${linear(`${id}-sheen`, [["0", "#fff", 0.16], ["1", "#fff", 0]], { x1: "0", y1: "0", x2: "0", y2: "1" })}`,
        body: `<rect x="2" y="2" width="796" height="496" rx="36" style="fill:#fff;fill-opacity:0.07"/>
<rect x="2" y="2" width="796" height="200" rx="36" style="fill:url(#${id}-sheen)"/>
<rect x="2" y="2" width="796" height="496" rx="36" style="fill:none;stroke:url(#${id}-edge);stroke-width:2"/>`,
      }),
  },
  {
    ...BASE,
    w: 1200,
    h: 200,
    stem: "wave-stroke",
    name: "Sine wave stroke",
    tags: ["wave", "sine", "line", "audio", "signal", "flow", "draw"],
    description: "Smooth sine wave in --accent with the draw-on dash. Draw it left to right under a headline or across a 'signal' scene.",
    svg: () => {
      const pts = range(25).map((i) => [20 + i * 48.3, 100 + Math.sin(i * 0.78) * 60]);
      return svg({ w: 1200, h: 200, title: "Sine wave stroke", body: drawStroke(smoothOpen(pts), { width: 10, id: "shape" }) });
    },
  },
  {
    ...BASE,
    w: 1200,
    h: 120,
    stem: "zigzag-stroke",
    name: "Zigzag stroke",
    tags: ["zigzag", "line", "energy", "pop", "memphis", "divider", "draw"],
    description: "Sharp zigzag line in --accent (draw-on dash). Memphis/pop dividers and energy accents.",
    svg: () => {
      const pts = range(17).map((i) => [20 + i * 72.5, i % 2 ? 100 : 20]);
      return svg({ w: 1200, h: 120, title: "Zigzag stroke", body: drawStroke(pts.map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join(" "), { width: 12, id: "shape" }) });
    },
  },
  {
    ...BASE,
    w: 900,
    h: 300,
    stem: "bauhaus-set",
    name: "Bauhaus shape set",
    tags: ["bauhaus", "geometric", "modernist", "semicircle", "triangle", "set", "swiss"],
    description: "Four modernist primitives side by side: #half-circle (--accent), #quarter (--accent-2), #triangle (--highlight), #square (--ink). Animate each from its own direction to build a composition.",
    svg: () =>
      svg({
        w: 900,
        h: 300,
        title: "Bauhaus shape set",
        body: `<path id="half-circle" d="M20 250 A110 110 0 0 1 240 250Z" style="fill:${c("accent")}"/>
<path id="quarter" d="M270 250 V30 A220 220 0 0 1 490 250Z" style="fill:${c("accent-2")}"/>
<path id="triangle" d="M520 250 L640 40 L760 250Z" style="fill:${c("highlight")}"/>
<rect id="square" x="780" y="130" width="100" height="120" style="fill:${c("ink")}"/>`,
      }),
  },
  {
    ...BASE,
    w: 512,
    h: 512,
    stem: "orbit-ring",
    name: "Dashed orbit ring",
    tags: ["orbit", "dashed", "circle", "path", "ecosystem", "integration", "hub"],
    description: "Dashed orbit circle with two small satellites (#sat-1, #sat-2). Integration hubs and ecosystems: rotate the satellites around the center with intent (a quarter turn per beat).",
    svg: () =>
      svg({
        w: 512,
        h: 512,
        title: "Dashed orbit ring",
        body: `<circle cx="256" cy="256" r="210" style="fill:none;stroke:${c("muted")};stroke-width:3;stroke-dasharray:4 14;stroke-linecap:round"/>
<circle id="sat-1" cx="256" cy="46" r="16" style="fill:${c("accent")}"/>
<circle id="sat-2" cx="466" cy="256" r="10" style="fill:${c("accent-2")}"/>`,
      }),
  },
  {
    ...BASE,
    w: 512,
    h: 512,
    stem: "hud-arcs",
    name: "HUD arc segments",
    tags: ["hud", "arcs", "sci-fi", "interface", "radar", "target", "tech"],
    description: "Concentric HUD arc segments (#arc-1..#arc-4, draw-on dash) in --accent-3. Sci-fi targeting around a product or stat; draw arcs in sequence, then hold.",
    svg: () => {
      const arcs = [
        [230, 20, 140, 8],
        [230, 200, 320, 8],
        [190, 60, 250, 4],
        [150, 280, 400, 14],
      ];
      // Arc sweeps of a few degrees beyond the visible pieces keep each path a single segment.
      const d = (r, a0, a1) => {
        const p = (a) => [256 + r * Math.cos(((a - 90) * Math.PI) / 180), 256 + r * Math.sin(((a - 90) * Math.PI) / 180)];
        const [x0, y0] = p(a0);
        const [x1, y1] = p(a1);
        return `M${f(x0)} ${f(y0)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${f(x1)} ${f(y1)}`;
      };
      return svg({
        w: 512,
        h: 512,
        title: "HUD arc segments",
        body: arcs.map(([r, a0, a1, w], i) => drawStroke(d(r, a0, a1), { width: w, id: `arc-${i + 1}`, color: c("accent-3"), cap: "butt" })).join("\n") + `\n<circle cx="256" cy="256" r="6" style="fill:${c("accent-3")}"/>`,
      });
    },
  },
];
