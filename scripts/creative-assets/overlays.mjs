// Full-frame overlays (1920x1080, transparent): laid over a finished scene with a blend mode.
import { blurFilter, c, f, linear, noiseFilter, radial, range, rng, svg } from "./lib.mjs";

const W = 1920;
const H = 1080;
const ov = (title, defs, body) => svg({ w: W, h: H, slice: true, title, defs, body });

const BASE = { kind: "overlay", w: W, h: H };
const css = (blend, opacity) => `position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none;mix-blend-mode:${blend};opacity:${opacity}`;

export default [
  {
    ...BASE,
    stem: "film-grain",
    name: "Film grain",
    tags: ["grain", "film", "noise", "analog", "cinematic", "texture", "organic"],
    description: "Fine monochrome film grain. Lay it over the whole film at low opacity for an analog, less-digital finish. Static grain is correct; never loop or jitter it.",
    usage_css: css("overlay", 0.35),
    svg: (id) => ov("Film grain", noiseFilter(`${id}-n`, { freq: 0.95, octaves: 2, alpha: 0.9, seed: 21 }), `<rect width="${W}" height="${H}" style="filter:url(#${id}-n)"/>`),
  },
  {
    ...BASE,
    stem: "paper-fibers",
    name: "Paper fiber texture",
    tags: ["paper", "fibers", "texture", "print", "craft", "collage", "multiply"],
    description: "Paper fibers and tooth for multiply blending. Turns flat vector scenes into printed, collage-style frames.",
    usage_css: css("multiply", 0.6),
    svg: (id) =>
      ov(
        "Paper fiber texture",
        `${noiseFilter(`${id}-a`, { freq: "0.01 0.5", octaves: 3, alpha: 0.35, seed: 4 })}${noiseFilter(`${id}-b`, { freq: 0.6, octaves: 2, alpha: 0.25, seed: 9 })}`,
        `<rect width="${W}" height="${H}" style="filter:url(#${id}-a)"/><rect width="${W}" height="${H}" style="filter:url(#${id}-b)"/>`,
      ),
  },
  {
    ...BASE,
    stem: "vignette",
    name: "Vignette",
    tags: ["vignette", "cinematic", "focus", "dark edges", "frame"],
    description: "Darkened edges that pull the eye to the center. Use on photo, footage and spotlight scenes; skip it on flat UI scenes.",
    usage_css: css("normal", 1),
    svg: (id) => ov("Vignette", radial(`${id}-g`, [["0.45", "#000", 0], ["1", "#000", 0.75]], { r: "75%" }), `<rect width="${W}" height="${H}" style="fill:url(#${id}-g)"/>`),
  },
  {
    ...BASE,
    stem: "scanlines",
    name: "CRT scanlines",
    tags: ["scanlines", "crt", "retro", "tv", "monitor", "glitch", "80s"],
    description: "Horizontal 4px scanlines for CRT/retro-monitor looks. Over footage or UI at low opacity.",
    usage_css: css("multiply", 0.5),
    svg: (id) =>
      ov(
        "CRT scanlines",
        `<pattern id="${id}-p" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="2" style="fill:#000;opacity:0.5"/></pattern>`,
        `<rect width="${W}" height="${H}" style="fill:url(#${id}-p)"/>`,
      ),
  },
  {
    ...BASE,
    stem: "rgb-subpixel",
    name: "RGB subpixel mask",
    tags: ["rgb", "subpixel", "crt", "screen", "macro", "retro", "display"],
    description: "Red/green/blue vertical subpixel stripes, the macro-photo look of a screen. Overlay on a screen recording during a punch-in.",
    usage_css: css("multiply", 0.4),
    svg: (id) =>
      ov(
        "RGB subpixel mask",
        `<pattern id="${id}-p" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="2" height="6" style="fill:#FF3B3B"/><rect x="2" width="2" height="6" style="fill:#36FF6A"/><rect x="4" width="2" height="6" style="fill:#3B6BFF"/></pattern>`,
        `<rect width="${W}" height="${H}" style="fill:url(#${id}-p)"/>`,
      ),
  },
  {
    ...BASE,
    stem: "light-leak-warm",
    name: "Warm light leak",
    tags: ["light leak", "warm", "film", "analog", "flare", "orange", "transition", "glow"],
    description: "Orange-red-gold light leak bleeding in from the left edge. Screen-blend it over a cut, or sweep it across a scene (translate x) as a warm transition.",
    usage_css: css("screen", 0.85),
    svg: (id) =>
      ov(
        "Warm light leak",
        blurFilter(`${id}-b`, 110),
        `<g style="filter:url(#${id}-b)">
  <ellipse cx="80" cy="420" rx="420" ry="620" style="fill:#FF4D1F;opacity:0.85"/>
  <ellipse cx="260" cy="260" rx="300" ry="360" style="fill:#FFB238;opacity:0.75"/>
  <ellipse cx="420" cy="760" rx="260" ry="300" style="fill:#FF2E63;opacity:0.5"/>
  <ellipse cx="40" cy="120" rx="200" ry="160" style="fill:#FFF1C1;opacity:0.9"/>
</g>`,
      ),
  },
  {
    ...BASE,
    stem: "light-leak-cool",
    name: "Cool light leak",
    tags: ["light leak", "cool", "blue", "teal", "film", "flare", "transition", "glow"],
    description: "Teal-blue-violet leak from the top right corner. The cool counterpart of light-leak-warm, for tech and night moods.",
    usage_css: css("screen", 0.8),
    svg: (id) =>
      ov(
        "Cool light leak",
        blurFilter(`${id}-b`, 120),
        `<g style="filter:url(#${id}-b)">
  <ellipse cx="1820" cy="160" rx="460" ry="420" style="fill:#2BD9FE;opacity:0.7"/>
  <ellipse cx="1560" cy="80" rx="360" ry="260" style="fill:#7B61FF;opacity:0.75"/>
  <ellipse cx="1880" cy="520" rx="240" ry="380" style="fill:#18C29C;opacity:0.45"/>
</g>`,
      ),
  },
  {
    ...BASE,
    stem: "film-burn",
    name: "Film burn",
    tags: ["film burn", "burn", "analog", "transition", "flash", "hot", "vintage"],
    description: "Hot white-orange film burn blooming from the bottom right. A one-shot transition accent: fade it up to 1 over the cut, then away.",
    usage_css: css("screen", 1),
    svg: (id) =>
      ov(
        "Film burn",
        `${blurFilter(`${id}-b`, 90)}${radial(`${id}-g`, [["0", "#FFFFFF", 1], ["0.25", "#FFE2A8", 0.95], ["0.6", "#FF7A1A", 0.7], ["1", "#B3170C", 0]])}`,
        `<g style="filter:url(#${id}-b)"><ellipse cx="1700" cy="900" rx="780" ry="560" style="fill:url(#${id}-g)"/><ellipse cx="1900" cy="1060" rx="300" ry="240" style="fill:#FFFFFF"/></g>`,
      ),
  },
  {
    ...BASE,
    stem: "dust-scratches",
    name: "Dust and scratches",
    tags: ["dust", "scratches", "film", "vintage", "analog", "damage", "old"],
    description: "Specks of dust and a few vertical scratches, white for screen blending. Vintage/archival flavor over footage and stills.",
    usage_css: css("screen", 0.7),
    svg: () => {
      const r = rng("dust");
      const specks = range(160)
        .map(() => {
          const x = r() * W;
          const y = r() * H;
          return `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(0.6 + r() * 2.6)}" ry="${f(0.5 + r() * 1.8)}" transform="rotate(${f(r() * 180)} ${f(x)} ${f(y)})" style="opacity:${f(0.3 + r() * 0.7)}"/>`;
        })
        .join("");
      const hairs = range(10)
        .map(() => {
          const x = r() * W;
          const y = r() * H;
          return `<path d="M${f(x)} ${f(y)} q${f(10 + r() * 30)} ${f(-10 + r() * 20)} ${f(20 + r() * 40)} ${f(-5 + r() * 30)}" style="fill:none;stroke:#fff;stroke-width:1.2;opacity:0.6"/>`;
        })
        .join("");
      const scratches = [260, 1180, 1610]
        .map((x, i) => `<path d="M${x} 0 L${x + (i - 1) * 6} ${H}" style="fill:none;stroke:#fff;stroke-width:${i === 1 ? 1.6 : 1};opacity:0.45"/>`)
        .join("");
      return ov("Dust and scratches", "", `<g style="fill:#fff">${specks}</g>${hairs}${scratches}`);
    },
  },
  {
    ...BASE,
    stem: "halftone-dots",
    name: "Halftone dot screen",
    tags: ["halftone", "dots", "print", "comic", "pop art", "screen", "multiply"],
    description: "Uniform halftone dot screen for multiply: makes photos and color fields read as printed comic/pop-art.",
    usage_css: css("multiply", 0.35),
    svg: (id) =>
      ov(
        "Halftone dot screen",
        `<pattern id="${id}-p" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="6" cy="6" r="3.2" style="fill:#000"/></pattern>`,
        `<rect width="${W}" height="${H}" style="fill:url(#${id}-p)"/>`,
      ),
  },
  {
    ...BASE,
    stem: "lens-flare",
    name: "Anamorphic lens flare",
    tags: ["lens flare", "anamorphic", "streak", "cinematic", "light", "glow", "sci-fi"],
    description: "Horizontal anamorphic streak with a hot core and ghost discs. Screen it over a logo or product reveal at the moment of impact; slide #streak a little along x as the camera moves.",
    usage_css: css("screen", 0.9),
    svg: (id) =>
      ov(
        "Anamorphic lens flare",
        `${blurFilter(`${id}-b`, 6)}${blurFilter(`${id}-b2`, 30)}${linear(`${id}-s`, [["0", "#4FB3FF", 0], ["0.5", "#CFF0FF", 1], ["1", "#4FB3FF", 0]])}${radial(`${id}-core`, [["0", "#FFFFFF", 1], ["0.3", "#BDE7FF", 0.7], ["1", "#4FB3FF", 0]])}`,
        `<g id="streak">
  <rect x="0" y="532" width="${W}" height="16" style="fill:url(#${id}-s);filter:url(#${id}-b)"/>
  <ellipse cx="960" cy="540" rx="260" ry="160" style="fill:url(#${id}-core);filter:url(#${id}-b2)"/>
</g>
<g style="fill:#8FD3FF;filter:url(#${id}-b)">
  <circle cx="1240" cy="600" r="46" style="opacity:0.18"/>
  <circle cx="1420" cy="640" r="22" style="opacity:0.25"/>
  <circle cx="1640" cy="690" r="80" style="opacity:0.1"/>
  <circle cx="700" cy="480" r="30" style="opacity:0.16"/>
</g>`,
      ),
  },
  {
    ...BASE,
    stem: "vhs-tracking",
    name: "VHS tracking bands",
    tags: ["vhs", "tracking", "glitch", "retro", "90s", "tape", "distortion", "noise"],
    description: "Two horizontal noise bands with red/cyan chroma bleed, like a VHS tracking error. Flash it for 2-6 frames on a glitch cut; move the bands (#bands) vertically between flashes.",
    usage_css: css("screen", 0.8),
    svg: (id) =>
      ov(
        "VHS tracking bands",
        `${noiseFilter(`${id}-n`, { freq: "0.002 0.9", octaves: 1, alpha: 0.9, seed: 31, type: "turbulence" })}`,
        `<g id="bands">
  <rect y="300" width="${W}" height="70" style="filter:url(#${id}-n);opacity:0.75"/>
  <rect y="820" width="${W}" height="28" style="filter:url(#${id}-n);opacity:0.6"/>
  <rect y="296" width="${W}" height="3" style="fill:#FF2B4E;opacity:0.7"/>
  <rect y="372" width="${W}" height="3" style="fill:#22E4FF;opacity:0.7"/>
  <rect y="818" width="${W}" height="2" style="fill:#FF2B4E;opacity:0.6"/>
</g>`,
      ),
  },
  {
    ...BASE,
    stem: "center-glow",
    name: "Center bloom glow",
    tags: ["glow", "bloom", "center", "highlight", "light", "emphasis", "hero"],
    description: "Soft --accent bloom in the center. Screen it behind a hero word or product to make it feel lit; scale it up with the reveal.",
    usage_css: css("screen", 0.9),
    svg: (id) => ov("Center bloom glow", radial(`${id}-g`, [["0", c("accent"), 0.85], ["0.4", c("accent"), 0.3], ["1", c("accent"), 0]], { r: "45%" }), `<rect width="${W}" height="${H}" style="fill:url(#${id}-g)"/>`),
  },
  {
    ...BASE,
    stem: "letterbox",
    name: "Cinematic letterbox bars",
    tags: ["letterbox", "cinematic", "bars", "widescreen", "film", "2.39"],
    description: "Black bars for a 2.39:1 frame inside 16:9 (#bar-top, #bar-bottom, 138px each). Slide them in for a 'cinematic moment', keep text inside the open band.",
    usage_css: "position:absolute;inset:0;width:100%;height:100%;pointer-events:none",
    svg: () => ov("Cinematic letterbox bars", "", `<rect id="bar-top" width="${W}" height="138" style="fill:#000"/><rect id="bar-bottom" y="${H - 138}" width="${W}" height="138" style="fill:#000"/>`),
  },
];
