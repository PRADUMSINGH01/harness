// Hand-drawn annotations (transparent): marker strokes that draw on. Every stroke is a draw-on path
// (class="draw", pathLength=1): tween stroke-dashoffset 1.02 -> 0 over 0.3-0.6s, strokes in order.
import { c, drawStroke, f, range, rng, smoothOpen, svg, wobble } from "./lib.mjs";

const BASE = { kind: "doodle" };
const DRAW_NOTE = "Draw it on: tween stroke-dashoffset of each .draw path from 1.02 to 0 (0.35-0.6s, power2.out), in document order. Recolor with --accent on an ancestor.";
const anim = { recommended_entrance: "stroke draw-on, 0.4s", suggested_ease: "power2.out", duration_seconds: 0.4 };

const hand = (pts, seed, amp = 4) => smoothOpen(wobble(pts, seed, amp));

// Two short strokes forming an arrowhead at (x, y) pointing along `angle` (radians).
function head(x, y, angle, size = 34) {
  const a1 = angle + Math.PI * 0.82;
  const a2 = angle - Math.PI * 0.82;
  return `M${f(x + Math.cos(a1) * size)} ${f(y + Math.sin(a1) * size)} L${f(x)} ${f(y)} L${f(x + Math.cos(a2) * size)} ${f(y + Math.sin(a2) * size)}`;
}

const doodle = (stem, name, w, h, tags, description, body) => ({
  ...BASE,
  stem,
  name,
  w,
  h,
  tags: ["doodle", "hand drawn", "annotation", "marker", "sketch", ...tags],
  description: `${description} ${DRAW_NOTE}`,
  animation: anim,
  svg: () => svg({ w, h, title: name, body: body() }),
});

export default [
  doodle("circle-scribble", "Circled scribble", 600, 300, ["circle", "highlight", "emphasis", "callout"], "Loose hand-drawn loop that circles a word, number or UI element; overshoots its start like a real pen.", () => {
    const pts = range(30).map((i) => {
      const t = i / 29;
      const a = (-160 + t * 400) * (Math.PI / 180);
      const shrink = 1 - t * 0.07;
      return [300 + Math.cos(a) * 270 * shrink, 150 + Math.sin(a) * 118 * shrink];
    });
    return drawStroke(hand(pts, "circle", 5), { width: 9 });
  }),
  doodle("underline-swoosh", "Underline swoosh", 800, 120, ["underline", "swoosh", "emphasis", "keyword"], "Confident marker swoosh that rises to the right, for underlining a key word.", () =>
    drawStroke(hand([[20, 86], [180, 80], [380, 70], [560, 58], [700, 46], [780, 34]], "swoosh", 3), { width: 12 }),
  ),
  doodle("underline-double", "Double underline", 800, 140, ["underline", "double", "emphasis", "important"], "Two quick strokes, the second shorter: 'this is important'.", () =>
    [drawStroke(hand([[20, 50], [260, 46], [520, 44], [780, 40]], "dbl-a", 3), { width: 10 }), drawStroke(hand([[70, 100], [330, 96], [620, 92]], "dbl-b", 3), { width: 10 })].join("\n"),
  ),
  doodle("underline-zigzag", "Zigzag underline", 800, 100, ["underline", "zigzag", "energy", "wavy"], "Quick zigzag underline with uneven peaks; playful emphasis.", () =>
    drawStroke(hand(range(15).map((i) => [20 + i * 54, i % 2 ? 76 : 30]), "zz", 5), { width: 8 }),
  ),
  doodle("arrow-curved", "Curved arrow", 420, 320, ["arrow", "curved", "pointer", "look here", "callout"], "Arcing arrow from bottom left to top right, pointing at something; flip it with scaleX(-1) for the other side.", () => {
    const pts = [[40, 280], [80, 200], [150, 130], [240, 90], [330, 74], [380, 74]];
    return [drawStroke(hand(pts, "arc", 3), { width: 9 }), drawStroke(head(380, 74, 0), { width: 9 })].join("\n");
  }),
  doodle("arrow-loop", "Loop-de-loop arrow", 560, 320, ["arrow", "loop", "playful", "pointer", "callout"], "Arrow with a playful loop in the middle; points right.", () => {
    const pts = [[30, 240], [110, 210], [190, 170], [250, 110], [232, 60], [184, 70], [190, 130], [260, 180], [360, 196], [460, 176], [520, 150]];
    return [drawStroke(hand(pts, "loop", 3), { width: 9 }), drawStroke(head(520, 150, -0.45), { width: 9 })].join("\n");
  }),
  doodle("arrow-straight", "Sketchy straight arrow", 560, 140, ["arrow", "straight", "pointer", "direction"], "Slightly wobbly straight arrow pointing right.", () =>
    [drawStroke(hand([[24, 76], [180, 72], [360, 68], [520, 66]], "straight", 3), { width: 9 }), drawStroke(head(522, 66, -0.02), { width: 9 })].join("\n"),
  ),
  doodle("arrow-down-curve", "Curving down arrow", 300, 420, ["arrow", "down", "curve", "look below", "pointer"], "Arrow that curls down from the top: 'look below' / 'here it is'.", () => {
    const pts = [[60, 30], [170, 50], [236, 120], [240, 220], [196, 310], [150, 380]];
    return [drawStroke(hand(pts, "down", 3), { width: 9 }), drawStroke(head(150, 382, 2.0), { width: 9 })].join("\n");
  }),
  {
    ...doodle("highlighter", "Highlighter swipe", 800, 140, ["highlighter", "marker", "highlight", "keyword", "yellow"], "Translucent highlighter swipe (--highlight) to lay behind a word. Put it under the text (z-index) and use mix-blend-mode: multiply on light grounds.", () =>
      drawStroke(hand([[30, 78], [300, 72], [560, 70], [770, 64]], "hl", 2), { width: 84, color: c("highlight"), opacity: 0.7, cap: "butt" }),
    ),
  },
  doodle("check", "Hand-drawn check", 200, 200, ["check", "tick", "done", "yes", "success", "approved"], "Quick check mark: confirmations, feature lists, 'done'.", () =>
    drawStroke(hand([[30, 108], [64, 138], [84, 162], [118, 112], [160, 52], [180, 30]], "check", 2), { width: 12, color: c("accent-3") }),
  ),
  doodle("cross", "Hand-drawn cross", 200, 200, ["cross", "x", "no", "wrong", "fail", "remove"], "Two crossing strokes: 'wrong', 'not this', the old way.", () =>
    [drawStroke(hand([[40, 40], [100, 100], [160, 162]], "x1", 3), { width: 12 }), drawStroke(hand([[162, 38], [100, 102], [38, 160]], "x2", 3), { width: 12 })].join("\n"),
  ),
  doodle("star", "Doodled star", 300, 300, ["star", "favorite", "best", "rating", "highlight"], "Single-stroke five-point star, a little lopsided.", () => {
    const pts = range(6).map((i) => {
      const a = -Math.PI / 2 + ((i * 2) % 5) * ((Math.PI * 2) / 5);
      return [150 + Math.cos(a) * 125, 156 + Math.sin(a) * 125];
    });
    return drawStroke(
      wobble(pts, "star", 6)
        .map((p, i) => `${i ? "L" : "M"}${f(p[0])} ${f(p[1])}`)
        .join(" "),
      { width: 9 },
    );
  }),
  doodle("heart", "Doodled heart", 300, 280, ["heart", "love", "like", "favorite", "care"], "Hand-drawn heart outline, slightly open at the top like a real stroke.", () =>
    drawStroke(hand([[150, 80], [120, 40], [70, 34], [36, 76], [44, 132], [98, 190], [150, 240], [204, 188], [258, 130], [264, 74], [228, 36], [178, 40], [150, 84]], "heart", 3), { width: 9 }),
  ),
  doodle("exclamation", "Exclamation mark", 120, 300, ["exclamation", "alert", "important", "attention", "warning"], "Sketchy exclamation mark: stroke then dot.", () =>
    [drawStroke(hand([[62, 30], [60, 110], [58, 200]], "excl", 3), { width: 14 }), drawStroke("M58 262 l1 1", { width: 22 })].join("\n"),
  ),
  doodle("brackets", "Sketch brackets", 600, 240, ["brackets", "frame", "emphasis", "quote", "focus"], "Rough square brackets framing a word or number (#left, #right): draw both, or slide them apart to reveal what's inside.", () =>
    [drawStroke(hand([[90, 24], [36, 30], [34, 120], [38, 214], [92, 218]], "bl", 2), { width: 10, id: "left" }), drawStroke(hand([[510, 24], [564, 30], [566, 120], [562, 214], [508, 218]], "br", 2), { width: 10, id: "right" })].join("\n"),
  ),
  doodle("emphasis-lines", "Emphasis pop lines", 300, 300, ["emphasis", "pop", "burst", "surprise", "action lines", "wow"], "Three short radiating strokes, the comic 'pop' beside a word or icon. Place at its top-left corner.", () =>
    [
      [
        [150, 120],
        [120, 40],
      ],
      [
        [180, 160],
        [260, 110],
      ],
      [
        [120, 170],
        [40, 140],
      ],
    ]
      .map((pts, i) => drawStroke(hand(pts, `pop${i}`, 2), { width: 12 }))
      .join("\n"),
  ),
  doodle("squiggle", "Squiggle", 600, 120, ["squiggle", "wavy", "playful", "divider", "decoration"], "Loose wavy squiggle for playful accents and dividers.", () =>
    drawStroke(hand(range(13).map((i) => [24 + i * 46, 60 + Math.sin(i * 1.4) * 34]), "squig", 3), { width: 9 }),
  ),
  doodle("box-scribble", "Scribbled box", 700, 260, ["box", "rectangle", "frame", "highlight", "callout", "focus"], "Rough rectangle drawn in one pass with overshooting corners; frames a UI region or a block of text.", () =>
    drawStroke(hand([[40, 34], [360, 26], [672, 30], [668, 130], [664, 228], [350, 232], [36, 226], [32, 120], [44, 20], [120, 22]], "box", 4), { width: 8 }),
  ),
  doodle("strike-through", "Messy strike-through", 700, 80, ["strike", "strikethrough", "cross out", "old price", "wrong"], "Messy strike-through for crossing out an old price, claim or 'the old way'.", () =>
    drawStroke(hand([[20, 48], [240, 40], [460, 38], [680, 30]], "strike", 4), { width: 10 }),
  ),
  doodle("crown", "Doodled crown", 300, 220, ["crown", "king", "best", "winner", "premium", "top"], "Hand-drawn crown to put on top of a winner, a top plan or 'the best'.", () =>
    drawStroke(hand([[40, 190], [30, 70], [100, 130], [150, 40], [200, 130], [270, 70], [260, 190], [40, 190]], "crown", 3), { width: 9 }),
  ),
  doodle("speech-bubble", "Sketchy speech bubble", 500, 360, ["speech", "bubble", "quote", "talk", "comment", "say"], "Rough speech bubble with a tail at the bottom left; put HTML text inside its 60..440 x 50..250 region.", () => {
    const pts = range(24).map((i) => {
      const a = Math.PI * 0.7 + (i / 23) * Math.PI * 2 * 0.92;
      return [250 + Math.cos(a) * 220, 150 + Math.sin(a) * 120];
    });
    return [drawStroke(hand(pts, "bubble", 3), { width: 8 }), drawStroke(smoothOpen([[222, 269], [150, 310], [96, 344], [112, 300], [121, 248]]), { width: 8 })].join("\n");
  }),
  doodle("lightbulb", "Doodled light bulb", 240, 320, ["lightbulb", "idea", "insight", "tip", "eureka", "creative"], "Light bulb with rays: 'idea', 'tip', 'insight'.", () => {
    const bulb = range(20).map((i) => {
      const a = Math.PI * 0.72 + (i / 19) * Math.PI * 1.56;
      return [120 + Math.cos(a) * 70, 140 + Math.sin(a) * 74];
    });
    return [
      drawStroke(hand(bulb, "bulb", 2), { width: 8 }),
      drawStroke(hand([[86, 214], [154, 214]], "b1", 1), { width: 8 }),
      drawStroke(hand([[92, 240], [148, 240]], "b2", 1), { width: 8 }),
      drawStroke("M28 70 L8 58 M120 30 L120 6 M212 70 L232 58", { width: 7 }),
    ].join("\n");
  }),
  doodle("spiral", "Spiral", 300, 300, ["spiral", "swirl", "hypnotic", "thinking", "dizzy"], "Hand-drawn spiral from the center outward: thinking, confusion, 'mind blown'.", () => {
    const pts = range(46).map((i) => {
      const a = i * 0.42;
      const r = 6 + i * 2.9;
      return [150 + Math.cos(a) * r, 150 + Math.sin(a) * r];
    });
    return drawStroke(hand(pts, "spiral", 1.5), { width: 7 });
  }),
  doodle("sparkle-outline", "Sketch sparkle", 240, 240, ["sparkle", "shine", "new", "magic", "star", "glint"], "Outline four-point sparkle, hand-drawn: decorate a 'new' feature or a beautiful result.", () =>
    drawStroke(hand([[120, 20], [134, 100], [220, 120], [134, 140], [120, 220], [106, 140], [20, 120], [106, 100], [120, 20]], "spark", 2), { width: 7 }),
  ),
  doodle("question-mark", "Question mark", 160, 300, ["question", "faq", "why", "confused", "ask"], "Hand-drawn question mark: questions, FAQs, 'why?'.", () =>
    [drawStroke(hand([[30, 80], [50, 34], [100, 24], [136, 64], [120, 112], [82, 146], [80, 200]], "q", 2), { width: 13 }), drawStroke("M80 258 l1 1", { width: 22 })].join("\n"),
  ),
];
