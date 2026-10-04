// Titles (transparent): lower thirds, callouts, labels, badges and chapter cards. Copy lives in
// <text id="..."> elements: inline the SVG and replace it with the brief's real words.
import { blurFilter, c, drawStroke, f, FONT, linear, poly, range, roundRect, starPoints, svg, text } from "./lib.mjs";

const BASE = { kind: "title" };
const LT = "Lower third: keep it in the lower-left safe area (left 6%, bottom 10% of the frame). Enter in 0.4-0.6s, hold while the speaker or scene needs it, exit along the same axis.";

export default [
  {
    ...BASE,
    stem: "lower-third-bar",
    name: "Lower third: accent bar",
    w: 1200,
    h: 220,
    tags: ["lower third", "name", "title", "speaker", "caption", "minimal", "interview"],
    description: `${LT} Parts: #bar (grow scaleY from the top), <text id="name">, <text id="role"> (slide each in from the left behind a clip).`,
    svg: () =>
      svg({
        w: 1200,
        h: 220,
        title: "Lower third, accent bar",
        body: `<rect id="bar" x="0" y="20" width="12" height="180" rx="6" style="fill:${c("accent")};transform-box:fill-box;transform-origin:top"/>
${text(44, 104, "Alex Rivera", { size: 68, weight: 800, color: c("ink"), id: "name" })}
${text(46, 170, "Founder & CEO, byreel", { size: 38, weight: 500, color: c("muted"), id: "role" })}`,
      }),
  },
  {
    ...BASE,
    stem: "lower-third-pill",
    name: "Lower third: avatar pill",
    w: 1000,
    h: 170,
    tags: ["lower third", "pill", "avatar", "creator", "youtube", "speaker", "social"],
    description: `${LT} A capsule (#pill) with an avatar circle (#avatar, put a real photo there with a circular clip) and <text id="name">/<text id="role">. Expand #pill from its left end (scaleX from 0.2) after the avatar pops.`,
    svg: (id) =>
      svg({
        w: 1000,
        h: 170,
        title: "Lower third, avatar pill",
        defs: linear(`${id}-av`, [["0", c("accent")], ["1", c("accent-2")]], { x1: "0", y1: "0", x2: "1", y2: "1" }),
        body: `<rect id="pill" x="5" y="5" width="990" height="160" rx="80" style="fill:${c("ui-panel", "#16181D")};fill-opacity:0.92;stroke:${c("ui-line", "#2C2F38")};stroke-width:2;transform-box:fill-box;transform-origin:left"/>
<circle id="avatar" cx="85" cy="85" r="60" style="fill:url(#${id}-av)"/>
${text(176, 78, "Alex Rivera", { size: 48, weight: 800, color: c("ink"), id: "name" })}
${text(178, 128, "Motion designer", { size: 32, weight: 500, color: c("muted"), id: "role" })}`,
      }),
  },
  {
    ...BASE,
    stem: "lower-third-blocks",
    name: "Lower third: stacked blocks",
    w: 1100,
    h: 240,
    tags: ["lower third", "blocks", "news", "bold", "documentary", "stacked"],
    description: `${LT} Two stacked blocks: #block-name (--accent) with <text id="name">, then #block-role (--surface) with <text id="role">. Wipe the blocks in left-to-right (scaleX from 0), the text 0.1s after each.`,
    svg: () =>
      svg({
        w: 1100,
        h: 240,
        title: "Lower third, stacked blocks",
        body: `<rect id="block-name" x="0" y="10" width="740" height="120" style="fill:${c("accent")};transform-box:fill-box;transform-origin:left"/>
${text(36, 92, "ALEX RIVERA", { size: 64, weight: 900, color: "#fff", id: "name", spacing: "2px" })}
<rect id="block-role" x="0" y="130" width="560" height="90" style="fill:${c("surface")};transform-box:fill-box;transform-origin:left"/>
${text(36, 189, "Head of Product", { size: 38, weight: 600, color: c("ink"), id: "role" })}`,
      }),
  },
  {
    ...BASE,
    stem: "lower-third-underline",
    name: "Lower third: underline",
    w: 1100,
    h: 220,
    tags: ["lower third", "underline", "elegant", "editorial", "minimal", "name"],
    description: `${LT} <text id="name">, a draw-on rule (#rule), <text id="role">. Draw #rule first (0.5s), then rise the name above it and drop the role below it.`,
    svg: () =>
      svg({
        w: 1100,
        h: 220,
        title: "Lower third, underline",
        body: `${text(0, 92, "Alex Rivera", { size: 72, weight: 700, color: c("ink"), id: "name" })}
${drawStroke("M2 126 H620", { width: 5, id: "rule" })}
${text(2, 182, "Founder, byreel", { size: 36, weight: 500, color: c("muted"), id: "role", spacing: "1px" })}`,
      }),
  },
  {
    ...BASE,
    stem: "lower-third-glass",
    name: "Lower third: glass panel",
    w: 1100,
    h: 240,
    tags: ["lower third", "glass", "frosted", "premium", "modern", "tech"],
    description: `${LT} Frosted glass panel (#panel) with an accent dot, <text id="name"> and <text id="role">. Pair with an HTML backdrop-filter: blur(20px) box behind it over footage.`,
    svg: (id) =>
      svg({
        w: 1100,
        h: 240,
        title: "Lower third, glass panel",
        defs: linear(`${id}-edge`, [["0", "#fff", 0.5], ["1", "#fff", 0.08]], { x1: "0", y1: "0", x2: "1", y2: "1" }),
        body: `<rect id="panel" x="2" y="2" width="1096" height="236" rx="34" style="fill:#fff;fill-opacity:0.08;stroke:url(#${id}-edge);stroke-width:2"/>
<circle cx="70" cy="88" r="14" style="fill:${c("accent")}"/>
${text(104, 104, "Alex Rivera", { size: 60, weight: 800, color: c("ink"), id: "name" })}
${text(106, 172, "Creative Director · Studio North", { size: 34, weight: 500, color: c("ink"), id: "role", opacity: 0.7 })}`,
      }),
  },
  {
    ...BASE,
    stem: "callout-leader",
    name: "Callout with leader line",
    w: 760,
    h: 320,
    tags: ["callout", "leader line", "annotation", "label", "feature", "pointer", "explainer"],
    description: "Anchor dot (#anchor, put it on the feature) + elbow leader (#leader, draw-on) + label box (#label-box with <text id=\"label\">). Pop #anchor, draw #leader, then reveal the label.",
    svg: () =>
      svg({
        w: 760,
        h: 320,
        title: "Callout with leader line",
        body: `<circle id="anchor" cx="40" cy="270" r="18" style="fill:${c("accent")}"/><circle cx="40" cy="270" r="32" style="fill:none;stroke:${c("accent")};stroke-width:3;opacity:0.5"/>
${drawStroke("M40 270 L180 110 H300", { width: 4, id: "leader", color: c("ink") })}
<g id="label-box"><rect x="300" y="60" width="440" height="100" rx="20" style="fill:${c("ink")}"/>${text(520, 124, "Auto-captions", { size: 40, weight: 700, color: c("surface"), anchor: "middle", id: "label" })}</g>`,
      }),
  },
  {
    ...BASE,
    stem: "callout-box",
    name: "Callout box with pointer",
    w: 640,
    h: 300,
    tags: ["callout", "speech", "box", "pointer", "annotation", "tip", "note"],
    description: "Rounded box with a pointer at the bottom left (tip at 90,288) and <text id=\"title\"> + <text id=\"body\">. Scale in from the pointer tip.",
    svg: () =>
      svg({
        w: 640,
        h: 300,
        title: "Callout box",
        body: `<path d="${roundRect(4, 4, 632, 220, 28)}" style="fill:${c("accent")}"/><path d="M70 222 L90 288 L150 222Z" style="fill:${c("accent")}"/>
${text(44, 100, "New in v2", { size: 48, weight: 800, color: "#fff", id: "title" })}
${text(44, 168, "Brand kits sync automatically.", { size: 32, weight: 500, color: "#fff", id: "body" })}`,
      }),
  },
  {
    ...BASE,
    stem: "tag-label",
    name: "Tag label",
    w: 460,
    h: 150,
    tags: ["tag", "label", "price tag", "category", "keyword", "badge"],
    description: "Swing-tag shape with a hole and <text id=\"label\">. Swing it in from the hole (transform-origin at 60,75) with a single damped settle, no loop.",
    svg: () =>
      svg({
        w: 460,
        h: 150,
        title: "Tag label",
        body: `<path fill-rule="evenodd" d="M8 75 L80 8 H440 a12 12 0 0 1 12 12 V130 a12 12 0 0 1 -12 12 H80Z M60 75 m-14 0 a14 14 0 1 0 28 0 a14 14 0 1 0 -28 0" style="fill:${c("accent")}"/>
${text(270, 92, "Limited", { size: 48, weight: 800, color: "#fff", anchor: "middle", id: "label" })}`,
      }),
  },
  {
    ...BASE,
    stem: "quote-marks",
    name: "Quote marks",
    w: 420,
    h: 320,
    tags: ["quote", "quotation marks", "testimonial", "review", "editorial", "speech"],
    description: "Oversized curly quote marks (#open, #close) for testimonials and pull-quotes. Pop #open before the quote types on, #close after.",
    svg: () => {
      // A "6"-shaped opening quote: a ball with a tail sweeping up and right; the closing quote is it turned 180 degrees.
      const q = (x, y, flip) =>
        `<path d="M${x} ${y + 120} a40 40 0 1 0 80 0 a40 40 0 1 0 -80 0Z M${x + 1} ${y + 116} C${x} ${y + 62} ${x + 30} ${y + 24} ${x + 84} ${y + 6} L${x + 92} ${y + 30} C${x + 58} ${y + 44} ${x + 42} ${y + 66} ${x + 44} ${y + 84}Z"${flip ? ` transform="rotate(180 ${x + 40} ${y + 90})"` : ""} style="fill:${c("accent")}"/>`;
      return svg({ w: 420, h: 320, title: "Quote marks", body: `<g id="open">${q(20, 20)}${q(120, 20)}</g><g id="close">${q(200, 140, true)}${q(300, 140, true)}</g>` });
    },
  },
  {
    ...BASE,
    stem: "sticker-new",
    name: "'NEW' sticker",
    w: 320,
    h: 320,
    tags: ["sticker", "new", "badge", "launch", "starburst", "promo", "announcement"],
    description: "Starburst sticker with <text id=\"label\">NEW</text>, tilted -12 degrees. Slap it onto a feature: scale 1.4 to 1 with a quick settle and a tiny shadow.",
    svg: () =>
      svg({
        w: 320,
        h: 320,
        title: "NEW sticker",
        body: `<g transform="rotate(-12 160 160)"><path d="${poly(starPoints(160, 160, 150, 128, 18))}" style="fill:${c("highlight")};stroke:#111;stroke-width:6;stroke-linejoin:round"/>${text(160, 186, "NEW", { size: 78, weight: 900, color: "#111", anchor: "middle", id: "label" })}</g>`,
      }),
  },
  {
    ...BASE,
    stem: "ribbon-banner",
    name: "Ribbon banner",
    w: 1000,
    h: 240,
    tags: ["ribbon", "banner", "award", "announcement", "badge", "celebration", "title"],
    description: "Folded ribbon with tails (#left-tail, #right-tail, #band) and <text id=\"label\">. Unfurl #band with scaleX from the center, then the tails.",
    svg: () =>
      svg({
        w: 1000,
        h: 240,
        title: "Ribbon banner",
        body: `<path id="left-tail" d="M20 70 H170 V210 H20 L70 140Z" style="fill:${c("ribbon-shade", "#B8341A")}"/>
<path id="right-tail" d="M980 70 H830 V210 H980 L930 140Z" style="fill:${c("ribbon-shade", "#B8341A")}"/>
<path d="M130 190 L170 210 V190Z M870 190 L830 210 V190Z" style="fill:#5A1408"/>
<rect id="band" x="130" y="30" width="740" height="160" style="fill:${c("accent")};transform-box:fill-box;transform-origin:center"/>
${text(500, 132, "Product of the Day", { size: 56, weight: 800, color: "#fff", anchor: "middle", id: "label" })}`,
      }),
  },
  {
    ...BASE,
    stem: "step-badge",
    name: "Step number badge",
    w: 220,
    h: 220,
    tags: ["step", "number", "badge", "how to", "tutorial", "sequence", "01"],
    description: "Numbered circle (<text id=\"number\">01</text>) with an outer ring (#ring, draw-on). Draw #ring, then pop the number: step markers for tutorials and 'how it works'.",
    svg: () =>
      svg({
        w: 220,
        h: 220,
        title: "Step number badge",
        body: `<circle cx="110" cy="110" r="78" style="fill:${c("accent")}"/>${drawStroke("M110 12 A98 98 0 1 1 109.9 12", { width: 5, id: "ring", color: c("accent") })}${text(110, 134, "01", { size: 68, weight: 800, color: "#fff", anchor: "middle", id: "number" })}`,
      }),
  },
  {
    ...BASE,
    stem: "corner-brackets-title",
    name: "Title in corner brackets",
    w: 1300,
    h: 420,
    tags: ["title", "brackets", "frame", "focus", "headline", "cinematic", "corners"],
    description: "Four corner brackets (#tl, #tr, #bl, #br) framing <text id=\"title\">. Start the brackets at the center and slide them out to their corners as the title resolves.",
    svg: () => {
      const L = 70;
      const s = `fill:none;stroke:${c("ink")};stroke-width:8;stroke-linecap:square`;
      return svg({
        w: 1300,
        h: 420,
        title: "Title in corner brackets",
        body: `<path id="tl" d="M10 ${10 + L} V10 H${10 + L}" style="${s}"/><path id="tr" d="M${1290 - L} 10 H1290 V${10 + L}" style="${s}"/><path id="bl" d="M10 ${410 - L} V410 H${10 + L}" style="${s}"/><path id="br" d="M${1290 - L} 410 H1290 V${410 - L}" style="${s}"/>
${text(650, 246, "Give every idea a moving form.", { size: 72, weight: 800, color: c("ink"), anchor: "middle", id: "title" })}`,
      });
    },
  },
  {
    ...BASE,
    stem: "kicker",
    name: "Kicker label",
    w: 700,
    h: 90,
    tags: ["kicker", "eyebrow", "label", "section", "overline", "category", "uppercase"],
    description: "Small uppercase eyebrow above a headline: #dot, <text id=\"label\">, and a draw-on #rule. Lead every section title with it.",
    svg: () => svg({ w: 700, h: 90, title: "Kicker label", body: `<circle id="dot" cx="14" cy="45" r="10" style="fill:${c("accent")}"/>${text(42, 56, "INTRODUCING", { size: 30, weight: 700, color: c("accent"), id: "label", spacing: "6px" })}${drawStroke("M330 45 H690", { width: 3, id: "rule", color: c("muted") })}` }),
  },
  {
    ...BASE,
    stem: "subscribe-button",
    name: "Subscribe button",
    w: 560,
    h: 150,
    tags: ["subscribe", "cta", "youtube", "follow", "bell", "creator", "end screen"],
    description: "Platform-neutral subscribe pill (#pill) with <text id=\"label\"> and a bell (#bell). For creator end screens: cursor clicks, label swaps to 'Subscribed' and #pill turns --muted; ring #bell once.",
    svg: () =>
      svg({
        w: 560,
        h: 150,
        title: "Subscribe button",
        body: `<rect id="pill" x="5" y="5" width="550" height="140" rx="70" style="fill:${c("subscribe", "#FF2D2D")}"/>
${text(232, 94, "Subscribe", { size: 50, weight: 800, color: "#fff", anchor: "middle", id: "label" })}
<g id="bell" style="fill:none;stroke:#fff;stroke-width:6;stroke-linecap:round;stroke-linejoin:round"><path d="M440 98 V74 a30 30 0 0 1 60 0 V98 l8 10 H432Z"/><path d="M462 118 a10 10 0 0 0 16 0"/></g>`,
      }),
  },
  {
    ...BASE,
    stem: "like-counter",
    name: "Like counter",
    w: 380,
    h: 150,
    tags: ["like", "heart", "counter", "engagement", "social", "reaction"],
    description: "Heart (#heart) and count (<text id=\"count\">). Pop the heart (scale 1.3 to 1) and tick the count up for social-proof beats.",
    svg: () =>
      svg({
        w: 380,
        h: 150,
        title: "Like counter",
        body: `<rect x="5" y="5" width="370" height="140" rx="70" style="fill:${c("ui-panel", "#16181D")}"/>
<path id="heart" d="M96 116 c-30 -24 -50 -40 -50 -62 a25 25 0 0 1 50 -10 a25 25 0 0 1 50 10 c0 22 -20 38 -50 62z" style="fill:${c("accent")}"/>
${text(176, 96, "12.4K", { size: 50, weight: 800, color: c("ink"), id: "count" })}`,
      }),
  },
  {
    ...BASE,
    stem: "chapter-card",
    name: "Chapter card",
    w: 1500,
    h: 340,
    tags: ["chapter", "section", "title card", "youtube", "episode", "part", "number"],
    description: "Chapter opener: big outlined number (<text id=\"number\">), a rule (#rule, draw-on), <text id=\"kicker\"> and <text id=\"title\">. For section breaks in longer videos.",
    svg: () =>
      svg({
        w: 1500,
        h: 340,
        title: "Chapter card",
        body: `<text id="number" x="0" y="270" style="font-family:${FONT};font-size:300px;font-weight:900;fill:none;stroke:${c("accent")};stroke-width:4">02</text>
${drawStroke("M420 60 V280", { width: 4, id: "rule", color: c("muted") })}
${text(470, 130, "CHAPTER TWO", { size: 34, weight: 700, color: c("accent"), id: "kicker", spacing: "6px" })}
${text(470, 222, "Building the brand kit", { size: 76, weight: 800, color: c("ink"), id: "title" })}`,
      }),
  },
  {
    ...BASE,
    stem: "price-tag",
    name: "Price callout",
    w: 520,
    h: 300,
    tags: ["price", "offer", "deal", "sale", "discount", "promo", "cost"],
    description: "Offer block: struck-through old price (<text id=\"old-price\"> + draw-on #strike), big <text id=\"price\">, <text id=\"note\">. Draw the strike, then slam the new price. Real prices only.",
    svg: () =>
      svg({
        w: 520,
        h: 300,
        title: "Price callout",
        body: `${text(10, 70, "$49", { size: 56, weight: 600, color: c("muted"), id: "old-price" })}
${drawStroke("M4 52 L130 40", { width: 7, id: "strike" })}
${text(6, 210, "$29", { size: 160, weight: 900, color: c("ink"), id: "price" })}
${text(10, 276, "per month, billed yearly", { size: 30, weight: 500, color: c("muted"), id: "note" })}`,
      }),
  },
];
