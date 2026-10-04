// Full-frame grounds (1920x1080, preserveAspectRatio slice): the layer every scene sits on.
import { blobPath, blurFilter, c, f, linear, noiseFilter, radial, range, rng, smoothClosed, smoothOpen, style, svg } from "./lib.mjs";

const W = 1920;
const H = 1080;
const bg = (title, defs, body) => svg({ w: W, h: H, slice: true, title, defs, body });
const ground = (color = c("surface")) => `<rect width="${W}" height="${H}" style="fill:${color}"/>`;

const BASE = {
  kind: "background",
  w: W,
  h: H,
  usage_css: "position:absolute;inset:0;width:100%;height:100%;object-fit:cover",
};

export default [
  {
    ...BASE,
    stem: "aurora-mesh",
    name: "Aurora gradient mesh (dark)",
    tags: ["gradient", "mesh", "aurora", "glow", "dark", "premium", "hero"],
    description:
      "Soft blurred color fields (--accent, --accent-2, --accent-3) on --surface: the default premium SaaS/AI hero ground. Give it life with a slow camera drift on its wrapper (scale 1.0 to 1.06 over the scene), never a looping wobble.",
    animation: { recommended_entrance: "fade in 0.6s, then slow scale 1.0 to 1.06 across the scene", suggested_ease: "sine.inOut", duration_seconds: 0.6 },
    svg: (id) =>
      bg(
        "Aurora gradient mesh",
        blurFilter(`${id}-blur`, 140),
        `${ground()}
<g style="filter:url(#${id}-blur)">
  <ellipse cx="420" cy="300" rx="560" ry="360" style="fill:${c("accent-2")};opacity:0.55"/>
  <ellipse cx="1500" cy="260" rx="520" ry="320" style="fill:${c("accent")};opacity:0.45"/>
  <ellipse cx="1180" cy="880" rx="640" ry="300" style="fill:${c("accent-3")};opacity:0.35"/>
  <ellipse cx="300" cy="960" rx="420" ry="240" style="fill:${c("accent")};opacity:0.25"/>
</g>`,
      ),
  },
  {
    ...BASE,
    stem: "aurora-light",
    name: "Aurora gradient mesh (light pastel)",
    tags: ["gradient", "mesh", "aurora", "light", "pastel", "soft", "hero"],
    description: "Pastel blurred color fields on --paper for light, friendly films (consumer apps, education). Dark --ink text reads cleanly on it.",
    svg: (id) =>
      bg(
        "Aurora gradient mesh, light",
        blurFilter(`${id}-blur`, 150),
        `${ground(c("paper"))}
<g style="filter:url(#${id}-blur)">
  <ellipse cx="380" cy="260" rx="520" ry="340" style="fill:${c("accent-2")};opacity:0.28"/>
  <ellipse cx="1540" cy="300" rx="500" ry="320" style="fill:${c("accent")};opacity:0.22"/>
  <ellipse cx="1000" cy="900" rx="700" ry="300" style="fill:${c("accent-3")};opacity:0.22"/>
</g>`,
      ),
  },
  {
    ...BASE,
    stem: "grainy-gradient",
    name: "Grainy noise gradient",
    tags: ["gradient", "grain", "noise", "texture", "trend", "duotone", "bold"],
    description: "Diagonal --accent-2 to --accent gradient with baked film grain: the 'noise gradient' look of 2025-26 brand films. Strong enough to carry white headline type.",
    svg: (id) =>
      bg(
        "Grainy noise gradient",
        `${linear(`${id}-g`, [["0", c("accent-2")], ["0.55", c("accent")], ["1", c("highlight")]], { x1: "0", y1: "1", x2: "1", y2: "0" })}${noiseFilter(`${id}-n`, { freq: 0.85, alpha: 0.35, seed: 3 })}`,
        `<rect width="${W}" height="${H}" style="fill:url(#${id}-g)"/>
<rect width="${W}" height="${H}" style="filter:url(#${id}-n);mix-blend-mode:overlay"/>`,
      ),
  },
  {
    ...BASE,
    stem: "dot-grid",
    name: "Dot grid with vignette fade",
    tags: ["grid", "dots", "tech", "minimal", "dark", "saas", "pattern"],
    description: "Even 40px dot grid in --muted that fades out toward the edges. Quiet technical ground for UI callouts, diagrams and kinetic type.",
    svg: (id) =>
      bg(
        "Dot grid",
        `<pattern id="${id}-p" width="40" height="40" patternUnits="userSpaceOnUse"><circle cx="20" cy="20" r="2.6" style="fill:${c("muted")}"/></pattern>${radial(`${id}-fade`, [["0", "#fff", 1], ["0.75", "#fff", 0.35], ["1", "#fff", 0]])}<mask id="${id}-m"><rect width="${W}" height="${H}" style="fill:url(#${id}-fade)"/></mask>`,
        `${ground()}
<rect width="${W}" height="${H}" mask="url(#${id}-m)" style="fill:url(#${id}-p);opacity:0.7"/>`,
      ),
  },
  {
    ...BASE,
    stem: "line-grid",
    name: "Square line grid",
    tags: ["grid", "lines", "graph paper", "tech", "dark", "blueprint", "pattern"],
    description: "80px square grid lines in --muted on --surface, fading at the edges. Pairs with diagrams, charts and product UI.",
    svg: (id) =>
      bg(
        "Line grid",
        `<pattern id="${id}-p" width="80" height="80" patternUnits="userSpaceOnUse"><path d="M80 0H0V80" style="fill:none;stroke:${c("muted")};stroke-width:1"/></pattern>${radial(`${id}-fade`, [["0", "#fff", 1], ["1", "#fff", 0]], { r: "70%" })}<mask id="${id}-m"><rect width="${W}" height="${H}" style="fill:url(#${id}-fade)"/></mask>`,
        `${ground()}
<rect width="${W}" height="${H}" mask="url(#${id}-m)" style="fill:url(#${id}-p);opacity:0.6"/>`,
      ),
  },
  {
    ...BASE,
    stem: "blueprint",
    name: "Blueprint grid",
    tags: ["blueprint", "grid", "engineering", "technical", "plan", "blue"],
    description: "Engineering blueprint: deep blue ground with minor 24px and major 120px grid lines. For 'how it works', architecture and build stories.",
    svg: (id) =>
      bg(
        "Blueprint grid",
        `<pattern id="${id}-minor" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" style="fill:none;stroke:#7FB6FF;stroke-width:0.6;opacity:0.35"/></pattern><pattern id="${id}-major" width="120" height="120" patternUnits="userSpaceOnUse"><path d="M120 0H0V120" style="fill:none;stroke:#A9CFFF;stroke-width:1.4;opacity:0.5"/></pattern>`,
        `${ground(c("blueprint", "#0D3B78"))}
<rect width="${W}" height="${H}" style="fill:url(#${id}-minor)"/>
<rect width="${W}" height="${H}" style="fill:url(#${id}-major)"/>`,
      ),
  },
  {
    ...BASE,
    stem: "isometric-grid",
    name: "Isometric grid",
    tags: ["isometric", "grid", "3d", "tech", "lines", "pattern"],
    description: "30-degree isometric line grid in --muted. Ground for isometric illustrations, stacks and 2.5D product diagrams.",
    svg: () => {
      const step = 64;
      const k = Math.tan(Math.PI / 6);
      const lines = [];
      for (let x = -H / k; x < W + H / k; x += step / k) {
        lines.push(`M${f(x)} 0 L${f(x + H / k)} ${H}`, `M${f(x)} ${H} L${f(x + H / k)} 0`);
      }
      for (let x = 0; x <= W; x += step / k) lines.push(`M${f(x)} 0 V${H}`);
      return bg("Isometric grid", "", `${ground()}\n<path d="${lines.join(" ")}" style="fill:none;stroke:${c("muted")};stroke-width:1.4;opacity:0.35"/>`);
    },
  },
  {
    ...BASE,
    stem: "perspective-floor",
    name: "Perspective grid floor with horizon glow",
    tags: ["synthwave", "retro", "perspective", "grid", "floor", "horizon", "80s", "neon"],
    description: "Retro-futurist floor grid converging on a glowing horizon (--accent glow, --accent-2 lines). For launches with a 'future' or gaming tone; push the camera forward over it.",
    svg: (id) => {
      const hy = 600;
      const vx = W / 2;
      const rays = range(41).map((i) => {
        const x = -1600 + i * 128;
        return `M${f(vx)} ${hy} L${f(x * 1.6 - vx * 0.6)} ${H}`;
      });
      const rows = range(14).map((i) => {
        const y = hy + (H - hy) * Math.pow((i + 1) / 14, 2.2);
        return `M0 ${f(y)} H${W}`;
      });
      return bg(
        "Perspective grid floor",
        `${linear(`${id}-sky`, [["0", c("surface")], ["1", c("accent-2")]], { x1: "0", y1: "0", x2: "0", y2: "1" })}${radial(`${id}-glow`, [["0", c("accent"), 0.9], ["1", c("accent"), 0]])}${linear(`${id}-fade`, [["0", "#fff", 0], ["0.35", "#fff", 1]], { x1: "0", y1: "0", x2: "0", y2: "1" })}<mask id="${id}-m"><rect y="${hy}" width="${W}" height="${H - hy}" style="fill:url(#${id}-fade)"/></mask>`,
        `${ground()}
<rect width="${W}" height="${hy}" style="fill:url(#${id}-sky);opacity:0.55"/>
<ellipse cx="${vx}" cy="${hy}" rx="900" ry="220" style="fill:url(#${id}-glow)"/>
<g mask="url(#${id}-m)"><rect y="${hy}" width="${W}" height="${H - hy}" style="fill:${c("surface")}"/><path d="${[...rays, ...rows].join(" ")}" style="fill:none;stroke:${c("accent-2")};stroke-width:2;opacity:0.85"/></g>
<rect y="${hy - 1}" width="${W}" height="3" style="fill:${c("accent")}"/>`,
      );
    },
  },
  {
    ...BASE,
    stem: "spotlight",
    name: "Center spotlight",
    tags: ["spotlight", "stage", "radial", "dark", "focus", "reveal", "product"],
    description: "Dark stage with a soft pool of light in the center: the classic product or logo-lockup reveal ground. Put the hero object in the light.",
    svg: (id) =>
      bg(
        "Center spotlight",
        radial(`${id}-g`, [["0", c("spot", "#3A3D46")], ["0.45", c("surface")], ["1", c("void", "#050506")]], { cy: "45%", r: "70%" }),
        `<rect width="${W}" height="${H}" style="fill:url(#${id}-g)"/>`,
      ),
  },
  {
    ...BASE,
    stem: "topographic",
    name: "Topographic contour lines",
    tags: ["topographic", "contour", "lines", "map", "organic", "outdoor", "pattern"],
    description: "Organic contour lines in --muted around three summits. Calm, editorial ground; slow-pan it for depth.",
    svg: () => {
      const summits = [
        [520, 380, "a"],
        [1460, 720, "b"],
        [1300, 180, "c"],
      ];
      const paths = summits.flatMap(([cx, cy, s]) => range(16).map((i) => blobPath(cx, cy, 40 + i * 46, 18, 0.12, `topo-${s}-${i % 5}`)));
      return bg("Topographic contour lines", "", `${ground()}\n<path d="${paths.join(" ")}" style="fill:none;stroke:${c("muted")};stroke-width:1.6;opacity:0.35"/>`);
    },
  },
  {
    ...BASE,
    stem: "concentric-rings",
    name: "Concentric rings",
    tags: ["rings", "circles", "radar", "ripple", "center", "reveal", "hypnotic"],
    description: "Rings radiating from the center, fading outward. Ground for logo/hero reveals and 'signal' themes; scale the rings group #rings slowly (1.0 to 1.1).",
    svg: () =>
      bg(
        "Concentric rings",
        "",
        `${ground()}
<g id="rings">${range(16)
          .map((i) => `<circle cx="960" cy="540" r="${90 + i * 68}" style="fill:none;stroke:${c("muted")};stroke-width:1.5;opacity:${f(0.55 - i * 0.03)}"/>`)
          .join("")}</g>`,
      ),
  },
  {
    ...BASE,
    stem: "sunburst",
    name: "Retro sunburst rays",
    tags: ["sunburst", "rays", "retro", "vintage", "pop", "burst", "sale", "energy"],
    description: "32 alternating rays from the center (--accent and a darker shade). Loud retro/pop energy for sale, reveal and 'big news' moments; rotate #rays slowly with intent.",
    svg: () => {
      const n = 32;
      const R = 1400;
      const rays = range(n / 2).map((i) => {
        const a0 = ((i * 2) / n) * Math.PI * 2;
        const a1 = ((i * 2 + 1) / n) * Math.PI * 2;
        return `M960 540 L${f(960 + Math.cos(a0) * R)} ${f(540 + Math.sin(a0) * R)} L${f(960 + Math.cos(a1) * R)} ${f(540 + Math.sin(a1) * R)}Z`;
      });
      return bg("Retro sunburst rays", "", `${ground(c("accent"))}\n<path id="rays" d="${rays.join(" ")}" style="fill:${c("accent-dark", "#D9411F")}"/>`);
    },
  },
  {
    ...BASE,
    stem: "diagonal-stripes",
    name: "Diagonal stripes",
    tags: ["stripes", "diagonal", "pattern", "warning", "bold", "sport"],
    description: "45-degree stripes in --muted on --surface at low contrast. Sporty/industrial ground; at high contrast (set --muted to --accent) it reads as a caution band.",
    svg: (id) =>
      bg(
        "Diagonal stripes",
        `<pattern id="${id}-p" width="48" height="48" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="18" height="48" style="fill:${c("muted")}"/></pattern>`,
        `${ground()}\n<rect width="${W}" height="${H}" style="fill:url(#${id}-p);opacity:0.18"/>`,
      ),
  },
  {
    ...BASE,
    stem: "halftone-fade",
    name: "Halftone dot fade",
    tags: ["halftone", "dots", "comic", "print", "pop art", "gradient", "retro"],
    description: "Halftone dots in --accent that shrink from left to right: comic/print energy. Great behind bold kinetic type.",
    svg: () => {
      const dots = [];
      for (let y = 0; y <= H; y += 28) {
        for (let x = (y / 28) % 2 ? 14 : 0; x <= W; x += 28) {
          const r = 12 * Math.max(0, 1 - x / (W * 0.85));
          if (r > 0.6) dots.push(`M${f(x - r)} ${y}a${f(r)} ${f(r)} 0 1 0 ${f(r * 2)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-r * 2)} 0`);
        }
      }
      return bg("Halftone dot fade", "", `${ground()}\n<path d="${dots.join("")}" style="fill:${c("accent")};opacity:0.9"/>`);
    },
  },
  {
    ...BASE,
    stem: "starfield",
    name: "Starfield",
    tags: ["stars", "space", "night", "cosmic", "sky", "galaxy", "particles"],
    description: "Deterministic starfield (420 stars, a few bright ones with glow) on a deep blue-black. For space, AI and 'scale' stories; drift it slowly sideways for parallax.",
    svg: (id) => {
      const r = rng("starfield");
      const small = range(420)
        .map(() => {
          const x = r() * W;
          const y = r() * H;
          const rad = 0.6 + Math.pow(r(), 3) * 2.2;
          return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(rad)}" style="opacity:${f(0.35 + r() * 0.65)}"/>`;
        })
        .join("");
      const bright = range(9)
        .map(() => `<circle cx="${f(r() * W)}" cy="${f(r() * H)}" r="${f(3 + r() * 3)}"/>`)
        .join("");
      return bg(
        "Starfield",
        `${radial(`${id}-sky`, [["0", c("sky", "#141B33")], ["1", c("void", "#05060B")]], { cy: "30%", r: "80%" })}${blurFilter(`${id}-glow`, 4)}`,
        `<rect width="${W}" height="${H}" style="fill:url(#${id}-sky)"/>
<g style="fill:${c("ink")}">${small}</g>
<g style="fill:${c("ink")};filter:url(#${id}-glow)">${bright}</g>`,
      );
    },
  },
  {
    ...BASE,
    stem: "bokeh",
    name: "Soft bokeh lights",
    tags: ["bokeh", "lights", "blur", "festive", "dreamy", "glow", "celebration"],
    description: "Out-of-focus light discs in --accent, --accent-2 and --highlight. Warm, celebratory ground for testimonials, end cards and seasonal promos.",
    svg: (id) => {
      const r = rng("bokeh");
      const cols = [c("accent"), c("accent-2"), c("highlight"), c("ink")];
      const discs = range(34)
        .map((i) => `<circle cx="${f(r() * W)}" cy="${f(r() * H)}" r="${f(30 + r() * 120)}" style="fill:${cols[i % cols.length]};opacity:${f(0.08 + r() * 0.22)}"/>`)
        .join("");
      return bg("Soft bokeh lights", blurFilter(`${id}-blur`, 18), `${ground()}\n<g style="filter:url(#${id}-blur)">${discs}</g>`);
    },
  },
  {
    ...BASE,
    stem: "wave-lines",
    name: "Flowing wave lines",
    tags: ["waves", "lines", "flow", "abstract", "audio", "elegant", "motion"],
    description: "28 flowing parallel curves with a gradient stroke (--accent-2 to --accent). Elegant motion ground for fintech, audio and AI; translate it slowly along x.",
    svg: (id) => {
      const paths = range(28).map((i) => {
        const pts = range(9).map((k) => {
          const x = -100 + k * 265;
          const y = 300 + i * 18 + Math.sin(k * 0.9 + i * 0.18) * (110 + i * 4);
          return [x, y];
        });
        return `<path d="${smoothOpen(pts)}" style="fill:none;stroke:url(#${id}-g);stroke-width:1.6;opacity:${f(0.25 + (i / 28) * 0.6)}"/>`;
      });
      return bg("Flowing wave lines", linear(`${id}-g`, [["0", c("accent-2")], ["1", c("accent")]], { units: "userSpaceOnUse", x1: "0", y1: "0", x2: String(W), y2: "0" }), `${ground()}\n${paths.join("\n")}`);
    },
  },
  {
    ...BASE,
    stem: "paper-cream",
    name: "Cream paper with fibers",
    tags: ["paper", "cream", "editorial", "light", "texture", "craft", "collage", "print"],
    description: "Warm --paper ground with subtle paper fibers baked in. The base for collage, editorial, hand-drawn and 'human' films (the 2026 imperfect look).",
    svg: (id) =>
      bg(
        "Cream paper",
        `${noiseFilter(`${id}-fib`, { freq: "0.012 0.6", octaves: 3, alpha: 0.12, seed: 11 })}${noiseFilter(`${id}-grain`, { freq: 0.7, alpha: 0.16, seed: 5 })}`,
        `${ground(c("paper"))}
<rect width="${W}" height="${H}" style="filter:url(#${id}-fib);mix-blend-mode:multiply"/>
<rect width="${W}" height="${H}" style="filter:url(#${id}-grain);mix-blend-mode:multiply"/>`,
      ),
  },
  {
    ...BASE,
    stem: "split-diagonal",
    name: "Diagonal two-tone split",
    tags: ["split", "diagonal", "comparison", "versus", "duotone", "before after"],
    description: "Frame split on a diagonal: --surface left, --accent right. Ground for versus, before/after and two-option comparisons; the halves are #side-a and #side-b so they can slide in from opposite edges.",
    svg: () =>
      bg(
        "Diagonal two-tone split",
        "",
        `<path id="side-a" d="M0 0 H1100 L820 1080 H0Z" style="fill:${c("surface")}"/>
<path id="side-b" d="M1100 0 H1920 V1080 H820Z" style="fill:${c("accent")}"/>
<path d="M1100 0 L820 1080" style="fill:none;stroke:${c("ink")};stroke-width:6"/>`,
      ),
  },
];
