// Transition mattes (transparent, solid --accent shapes): a shape that sweeps over the cut and reveals
// the next scene. Two ways to use one:
//   1. Shape wipe: inline it above both scenes, set --accent to a brand color, move or scale it across
//      the frame; swap scenes on the frame it fully covers. Most robust; always works.
//   2. Mask reveal: CSS mask-image: url(assets/matte/...svg) on the incoming scene and tween
//      mask-size/mask-position (or the parts' transforms when inlined as an SVG <mask>).
// Respect the film's vector ledger: a wipe moves in the current's direction.
import { blobPath, c, f, poly, range, rng, smoothClosed, starPoints, svg } from "./lib.mjs";

const W = 1920;
const H = 1080;
const BASE = { kind: "matte" };
const fill = `fill:${c("accent")}`;

export default [
  {
    ...BASE,
    stem: "diagonal-wipe",
    name: "Diagonal wipe panel",
    w: 2880,
    h: 1080,
    tags: ["wipe", "diagonal", "transition", "slash", "swipe", "cut"],
    description: "A slanted panel 1.5 frames wide (#panel). Size it width:150%; height:100%, start it fully left of the frame (translateX(-100%)) and sweep to translateX(100%) over 0.5-0.7s; swap scenes at the midpoint when it covers the frame.",
    svg: () => svg({ w: 2880, h: H, title: "Diagonal wipe panel", body: `<path id="panel" d="M420 0 H2880 L2460 1080 H0Z" style="${fill}"/>` }),
  },
  {
    ...BASE,
    stem: "circle-iris",
    name: "Circle iris",
    w: W,
    h: H,
    tags: ["iris", "circle", "zoom", "transition", "reveal", "spotlight", "cut"],
    description: "Circle (#circle) large enough to cover the frame from the center. Scale it from 0 (iris open over the cut) or from 1 to 0 (iris close); move transform-origin to open from the subject.",
    svg: () => svg({ w: W, h: H, title: "Circle iris", body: `<circle id="circle" cx="960" cy="540" r="1110" style="${fill};transform-origin:960px 540px"/>` }),
  },
  {
    ...BASE,
    stem: "brush-stroke",
    name: "Brush stroke wipe",
    w: 2400,
    h: 1080,
    tags: ["brush", "paint", "stroke", "wipe", "organic", "grunge", "transition", "hand made"],
    description: "Ragged painted band (#stroke) wider than the frame. Sweep it across (translateX -100% to 100%) for a hand-made paint wipe; as a mask it reveals the next scene with brushed edges.",
    svg: () => {
      const r = rng("brush");
      const top = range(60).map((i) => [i * 40.7, 70 + Math.sin(i * 0.5) * 30 + r() * 46]);
      const bottom = range(60).map((i) => [2400 - i * 40.7, 1010 - Math.sin(i * 0.45) * 30 - r() * 46]);
      const flecks = range(26)
        .map(() => `<ellipse cx="${f(r() * 2400)}" cy="${f(r() < 0.5 ? 20 + r() * 40 : 1020 + r() * 40)}" rx="${f(4 + r() * 22)}" ry="${f(2 + r() * 7)}"/>`)
        .join("");
      return svg({ w: 2400, h: H, title: "Brush stroke wipe", body: `<g id="stroke" style="${fill}"><path d="${poly([...top, ...bottom])}"/>${flecks}</g>` });
    },
  },
  {
    ...BASE,
    stem: "ink-splash",
    name: "Ink splash",
    w: W,
    h: H,
    tags: ["ink", "splash", "splat", "paint", "burst", "organic", "transition", "reveal"],
    description: "Central ink splat with droplets (#splat, .drop). Scale #splat from 0 to 2.2 from the center over 0.5s to cover the frame, then reveal the next scene; drops trail 0.05s behind.",
    svg: () => {
      const r = rng("ink");
      const pts = range(40).map((i) => {
        const a = (i / 40) * Math.PI * 2;
        const spike = i % 4 === 0 ? 1.35 + r() * 0.45 : 0.9 + r() * 0.18;
        return [960 + Math.cos(a) * 380 * spike, 540 + Math.sin(a) * 330 * spike];
      });
      const drops = range(14)
        .map(() => {
          const a = r() * Math.PI * 2;
          const d = 620 + r() * 260;
          return `<circle class="drop" cx="${f(960 + Math.cos(a) * d)}" cy="${f(540 + Math.sin(a) * d * 0.8)}" r="${f(10 + r() * 34)}"/>`;
        })
        .join("");
      return svg({ w: W, h: H, title: "Ink splash", body: `<g style="${fill}"><path id="splat" d="${smoothClosed(pts, 0.8)}" style="transform-origin:960px 540px"/>${drops}</g>` });
    },
  },
  {
    ...BASE,
    stem: "liquid-wave",
    name: "Liquid wave rise",
    w: W,
    h: 1400,
    tags: ["liquid", "wave", "fill", "rise", "water", "transition", "fluid"],
    description: "Panel with a wavy top edge (#wave), 1400 tall. Rise it from below the frame (translateY(100%) to translateY(-23%)) to flood the screen; the wave edge leads.",
    svg: () => {
      const pts = range(13).map((i) => [i * 160, 160 + Math.sin(i * 1.1) * 70]);
      let d = `M0 ${f(pts[0][1])}`;
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1];
        const [x1, y1] = pts[i];
        d += ` C${f(x0 + 80)} ${f(y0)} ${f(x1 - 80)} ${f(y1)} ${f(x1)} ${f(y1)}`;
      }
      return svg({ w: W, h: 1400, title: "Liquid wave rise", body: `<path id="wave" d="${d} V1400 H0Z" style="${fill}"/>` });
    },
  },
  {
    ...BASE,
    stem: "stripes-wipe",
    name: "Vertical stripes wipe",
    w: W,
    h: H,
    tags: ["stripes", "bars", "wipe", "stagger", "transition", "blinds", "venetian"],
    description: "Eight full-height bars (#bar-1..8, .bar). Grow them with scaleY 0 to 1 (transform-origin top or bottom), staggered 0.04s left to right, cut, then retract the other way.",
    svg: () =>
      svg({
        w: W,
        h: H,
        title: "Vertical stripes wipe",
        body: range(8)
          .map((i) => `<rect id="bar-${i + 1}" class="bar" x="${i * 240}" y="0" width="241" height="${H}" style="${fill};transform-box:fill-box;transform-origin:top"/>`)
          .join(""),
      }),
  },
  {
    ...BASE,
    stem: "shutter",
    name: "Camera shutter blades",
    w: W,
    h: H,
    tags: ["shutter", "camera", "aperture", "iris", "blades", "photo", "transition"],
    description: "Six aperture blades (#blade-1..6) that close to the center. Rotate each blade about the frame center (transform-origin 960px 540px) from 60 degrees open to 0 to close, then reverse to open on the next scene.",
    svg: () =>
      svg({
        w: W,
        h: H,
        title: "Camera shutter blades",
        body: range(6)
          .map((i) => {
            const a0 = (i / 6) * Math.PI * 2;
            const a1 = ((i + 1.35) / 6) * Math.PI * 2;
            const R = 1800;
            return `<path id="blade-${i + 1}" d="M960 540 L${f(960 + Math.cos(a0) * R)} ${f(540 + Math.sin(a0) * R)} L${f(960 + Math.cos(a1) * R)} ${f(540 + Math.sin(a1) * R)}Z" style="fill:${i % 2 ? c("accent") : c("accent-dark", "#D9411F")};transform-origin:960px 540px"/>`;
          })
          .join(""),
      }),
  },
  {
    ...BASE,
    stem: "zigzag-tear",
    name: "Zigzag tear panel",
    w: 2200,
    h: H,
    tags: ["zigzag", "tear", "jagged", "wipe", "transition", "energetic"],
    description: "Panel with a sharp zigzag leading edge on the right (#panel). Sweep it left to right across the frame.",
    svg: () => {
      const pts = [[0, 0], [1900, 0], ...range(13).map((i) => [i % 2 ? 2200 : 1960, i * 90]), [1900, H], [0, H]];
      return svg({ w: 2200, h: H, title: "Zigzag tear panel", body: `<path id="panel" d="${poly(pts)}" style="${fill}"/>` });
    },
  },
  {
    ...BASE,
    stem: "grid-tiles",
    name: "Grid tiles transition",
    w: W,
    h: H,
    tags: ["grid", "tiles", "mosaic", "pixel", "stagger", "transition", "squares"],
    description: "8x5 tiles (.tile, #tile-1..40, 240x216 each). Scale tiles 0 to 1 from their centers, staggered diagonally (grid stagger, from the top-left), to tile over the cut; reverse to reveal.",
    svg: () => {
      const tiles = [];
      for (let y = 0; y < 5; y++) for (let x = 0; x < 8; x++) tiles.push(`<rect id="tile-${y * 8 + x + 1}" class="tile" x="${x * 240}" y="${y * 216}" width="241" height="217" style="${fill};transform-box:fill-box;transform-origin:center"/>`);
      return svg({ w: W, h: H, title: "Grid tiles transition", body: tiles.join("") });
    },
  },
  {
    ...BASE,
    stem: "glitch-slices",
    name: "Glitch slices",
    w: W,
    h: H,
    tags: ["glitch", "slices", "digital", "distortion", "transition", "cyber", "error"],
    description: "Twelve horizontal slices of varied height (.slice, #slice-1..12). Flash them over the cut for 3-6 frames, offsetting each slice's x by a seeded amount per frame (stepped ease), then cut clean.",
    svg: () => {
      const r = rng("glitch");
      let y = 0;
      const slices = range(12).map((i) => {
        const h = i === 11 ? H - y : 40 + r() * 100;
        const el = `<rect id="slice-${i + 1}" class="slice" x="${f(-80 + r() * 160)}" y="${f(y)}" width="${W}" height="${f(Math.min(h, H - y))}" style="fill:${i % 3 === 0 ? c("accent-2") : c("accent")};opacity:${f(0.75 + r() * 0.25)}"/>`;
        y += h;
        return el;
      });
      return svg({ w: W, h: H, title: "Glitch slices", body: slices.join("") });
    },
  },
  {
    ...BASE,
    stem: "chevron-push",
    name: "Chevron push",
    w: 2600,
    h: H,
    tags: ["chevron", "arrow", "push", "forward", "wipe", "transition", "next"],
    description: "Giant right-pointing chevron panel (#panel). Push it left to right across the frame: a 'forward/next' transition that obeys a rightward current.",
    svg: () => svg({ w: 2600, h: H, title: "Chevron push", body: `<path id="panel" d="M0 0 H2000 L2600 540 L2000 1080 H0 L600 540Z" style="${fill}"/>` }),
  },
  {
    ...BASE,
    stem: "paper-tear",
    name: "Torn paper panel",
    w: 2100,
    h: H,
    tags: ["paper", "torn", "rip", "collage", "craft", "transition", "tear"],
    description: "Paper panel (--paper) with a torn right edge and a lighter fiber lip (#paper, #lip). Slide it across for a collage-style rip transition; pair with paper-fibers overlay.",
    svg: () => {
      const r = rng("tear");
      const edge = range(55).map((i) => [1900 + r() * 70 + Math.sin(i * 0.7) * 30, i * 20]);
      const lip = edge.map(([x, y]) => [x + 10 + r() * 14, y]);
      return svg({
        w: 2100,
        h: H,
        title: "Torn paper panel",
        body: `<path id="lip" d="${poly([[0, 0], ...lip, [0, H]])}" style="fill:${c("paper-lip", "#FFFFFF")}"/><path id="paper" d="${poly([[0, 0], ...edge, [0, H]])}" style="fill:${c("paper")}"/>`,
      });
    },
  },
  {
    ...BASE,
    stem: "star-zoom",
    name: "Star zoom-through",
    w: W,
    h: H,
    tags: ["star", "zoom", "burst", "transition", "punchy", "pop", "reveal"],
    description: "Five-point star (#star) centered. Scale it from 0 to 9 from the center to punch through to the next scene; for a playful, high-energy cut.",
    svg: () => svg({ w: W, h: H, title: "Star zoom-through", body: `<path id="star" d="${poly(starPoints(960, 560, 300, 130, 5))}" style="${fill};transform-origin:960px 540px"/>` }),
  },
  {
    ...BASE,
    stem: "split-halves",
    name: "Split halves",
    w: W,
    h: H,
    tags: ["split", "halves", "diagonal", "doors", "open", "reveal", "transition"],
    description: "Two diagonal halves (#half-a, #half-b) that close over the frame like doors. Slide #half-a in from the left and #half-b from the right; reverse to open on the next scene.",
    svg: () =>
      svg({
        w: W,
        h: H,
        title: "Split halves",
        body: `<path id="half-a" d="M0 0 H1100 L820 1080 H0Z" style="${fill}"/><path id="half-b" d="M1100 0 H1920 V1080 H820Z" style="fill:${c("accent-2")}"/>`,
      }),
  },
];
