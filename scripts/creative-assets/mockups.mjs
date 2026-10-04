// UI mockups (transparent): device frames, windows, cursors and generic UI pieces for product films.
// Frames have a transparent screen region; place the real screenshot BEHIND the frame, never invent UI.
// Text lives in <text id="..."> elements: inline the SVG and replace the copy with the brief's real words.
import { blurFilter, c, drawStroke, f, FONT, linear, MONO, range, roundRect, style, svg, text } from "./lib.mjs";

const BASE = { kind: "mockup" };
const chrome = c("ui-chrome", "#1D1F26");
const panel = c("ui-panel", "#16181D");
const line = c("ui-line", "#2C2F38");
const dots = (x, y) =>
  [
    ["#FF5F57", 0],
    ["#FEBC2E", 1],
    ["#28C840", 2],
  ]
    .map(([col, i]) => `<circle cx="${x + i * 30}" cy="${y}" r="9" style="fill:${col}"/>`)
    .join("");
const pct = (n, of) => `${f((n / of) * 100)}%`;

function frameWithHole(outer, hole) {
  return `<path fill-rule="evenodd" d="${outer} ${hole}" style="fill:${c("device", "#0B0C0F")}"/>`;
}

export default [
  ...[
    ["browser-dark", "Browser window (dark)", { body: panel, bar: chrome, pill: "#2A2D35", text: c("muted") }],
    ["browser-light", "Browser window (light)", { body: "#FFFFFF", bar: "#ECEDEF", pill: "#FFFFFF", text: "#6B7078" }],
  ].map(([stem, name, k]) => ({
    ...BASE,
    stem,
    name,
    w: 1600,
    h: 1000,
    tags: ["browser", "window", "web", "website", "frame", "saas", "screenshot", stem.endsWith("dark") ? "dark" : "light"],
    description: `Generic browser window (no vendor branding) with traffic lights and an address bar (<text id="url">, set it to the real domain). Content area #viewport is a transparent opening starting ${pct(88, 1000)} from the top (1600x912 units): place the real screenshot behind the frame there with top:${pct(88, 1000)}; left:0; width:100%; height:${pct(912, 1000)}; object-fit:cover; object-position:top, inside a wrapper with the same rounded corners. Scroll the screenshot (translateY) to tour the page.`,
    svg: () =>
      svg({
        w: 1600,
        h: 1000,
        title: name,
        body: `<path fill-rule="evenodd" d="${roundRect(0, 0, 1600, 1000, 22)} M0 88 V1000 H1600 V88Z" style="fill:${k.body}"/>
<path d="${roundRect(1, 1, 1598, 998, 21)}" style="fill:none;stroke:${k.bar};stroke-width:2"/>
<path d="M0 22 A22 22 0 0 1 22 0 H1578 A22 22 0 0 1 1600 22 V88 H0Z" style="fill:${k.bar}"/>
${dots(40, 44)}
<rect x="420" y="22" width="760" height="44" rx="22" style="fill:${k.pill}"/>
<path d="M452 40 v-5 a7 7 0 0 1 14 0 v5 M448 40 h22 v14 h-22z" style="fill:none;stroke:${k.text};stroke-width:2"/>
${text(484, 52, "yourproduct.com", { size: 22, weight: 500, color: k.text, id: "url" })}
<rect id="viewport" x="0" y="88" width="1600" height="912" style="fill:none"/>`,
      }),
  })),
  {
    ...BASE,
    stem: "phone",
    name: "Smartphone frame",
    w: 440,
    h: 900,
    tags: ["phone", "mobile", "smartphone", "device", "frame", "app", "ios", "android"],
    description: `Generic modern phone (no brand marks) with a transparent screen. Screen box: left ${pct(18, 440)}, top ${pct(18, 900)}, width ${pct(404, 440)}, height ${pct(864, 900)}, corner radius ${pct(54, 440)} of the frame width. Put the app screenshot behind the frame at that box; tilt and float the whole stack with the camera, not with a wobble.`,
    svg: () =>
      svg({
        w: 440,
        h: 900,
        title: "Smartphone frame",
        body: `${frameWithHole(roundRect(0, 0, 440, 900, 72), roundRect(18, 18, 404, 864, 54))}
<path d="${roundRect(1.5, 1.5, 437, 897, 70.5)}" style="fill:none;stroke:${c("device-edge", "#3A3D45")};stroke-width:3"/>
<rect x="170" y="36" width="100" height="30" rx="15" style="fill:${c("device", "#0B0C0F")}"/>
<rect x="-4" y="190" width="6" height="70" rx="3" style="fill:${c("device-edge", "#3A3D45")}"/>
<rect x="438" y="230" width="6" height="110" rx="3" style="fill:${c("device-edge", "#3A3D45")}"/>`,
      }),
  },
  {
    ...BASE,
    stem: "laptop",
    name: "Laptop frame",
    w: 1600,
    h: 1000,
    tags: ["laptop", "notebook", "device", "frame", "desktop app", "screen", "saas"],
    description: `Generic laptop with a transparent screen. Screen box: left ${pct(128, 1600)}, top ${pct(48, 1000)}, width ${pct(1344, 1600)}, height ${pct(824, 1000)}. Put the desktop screenshot behind it at that box. Push in on the screen to transition into a full-frame UI shot.`,
    svg: (id) =>
      svg({
        w: 1600,
        h: 1000,
        title: "Laptop frame",
        defs: linear(`${id}-base`, [["0", c("device-light", "#C9CCD2")], ["1", c("device-mid", "#8D9199")]], { x1: "0", y1: "0", x2: "0", y2: "1" }),
        body: `${frameWithHole(roundRect(100, 20, 1400, 880, 34), roundRect(128, 48, 1344, 824, 8))}
<circle cx="800" cy="34" r="5" style="fill:#2A2C31"/>
<path d="M0 900 H1600 L1560 960 Q1550 972 1530 972 H70 Q50 972 40 960Z" style="fill:url(#${id}-base)"/>
<path d="M700 900 h200 q0 14 -14 14 h-172 q-14 0 -14 -14z" style="fill:${c("device-mid", "#8D9199")}"/>`,
      }),
  },
  {
    ...BASE,
    stem: "tablet",
    name: "Tablet frame",
    w: 900,
    h: 1200,
    tags: ["tablet", "ipad", "device", "frame", "app", "screen"],
    description: `Generic tablet (portrait) with a transparent screen: left ${pct(36, 900)}, top ${pct(36, 1200)}, width ${pct(828, 900)}, height ${pct(1128, 1200)}, radius ${pct(26, 900)} of width. Rotate 90 degrees for landscape.`,
    svg: () =>
      svg({
        w: 900,
        h: 1200,
        title: "Tablet frame",
        body: `${frameWithHole(roundRect(0, 0, 900, 1200, 60), roundRect(36, 36, 828, 1128, 26))}
<path d="${roundRect(1.5, 1.5, 897, 1197, 58.5)}" style="fill:none;stroke:${c("device-edge", "#3A3D45")};stroke-width:3"/>
<circle cx="450" cy="18" r="5" style="fill:#2A2C31"/>`,
      }),
  },
  {
    ...BASE,
    stem: "terminal",
    name: "Terminal window",
    w: 1200,
    h: 700,
    tags: ["terminal", "cli", "command line", "shell", "developer", "code", "console"],
    description: "Dark terminal with a prompt and output lines (#line-1..#line-4, mono) and a block caret (#caret). Replace the copy with the product's real commands; type #line-1 on character by character (a text-typing component or steps() ease), then reveal output lines.",
    svg: () =>
      svg({
        w: 1200,
        h: 700,
        title: "Terminal window",
        body: `<path d="${roundRect(0, 0, 1200, 700, 18)}" style="fill:${c("term-bg", "#0E1014")}"/>
<path d="M0 18 A18 18 0 0 1 18 0 H1182 A18 18 0 0 1 1200 18 V56 H0Z" style="fill:${chrome}"/>
${dots(32, 28)}
${text(600, 37, "zsh", { size: 20, weight: 500, color: c("muted"), anchor: "middle" })}
${text(40, 130, "$ npm run build", { size: 30, weight: 500, family: MONO, color: c("ink"), id: "line-1" })}
${text(40, 186, "> compiling 128 modules", { size: 30, weight: 400, family: MONO, color: c("muted"), id: "line-2" })}
${text(40, 242, "✓ built in 1.2s", { size: 30, weight: 500, family: MONO, color: c("accent-3"), id: "line-3" })}
${text(40, 298, "$", { size: 30, weight: 500, family: MONO, color: c("ink"), id: "line-4" })}
<rect id="caret" x="66" y="274" width="16" height="32" style="fill:${c("ink")}"/>`,
      }),
  },
  {
    ...BASE,
    stem: "code-editor",
    name: "Code editor window",
    w: 1200,
    h: 760,
    tags: ["code", "editor", "ide", "developer", "syntax", "programming", "dev tool"],
    description: "Dark code editor with a file tab, gutter numbers and abstract syntax-colored code lines (each line is a .code-line group, #code-line-1..12). Reveal lines top to bottom 0.05s apart to suggest code being written; swap in real code as <text> when the brief has it.",
    svg: () => {
      const palette = [c("accent-2"), c("accent"), c("accent-3"), c("ink"), c("muted"), c("highlight")];
      const lines = [
        [[0, 90, 0], [100, 160, 3], [270, 60, 1]],
        [[30, 120, 2], [160, 220, 3]],
        [[30, 80, 0], [120, 140, 3], [270, 90, 5]],
        [],
        [[0, 110, 0], [120, 180, 1], [310, 50, 4]],
        [[30, 200, 3], [240, 120, 2]],
        [[60, 140, 4], [210, 260, 3]],
        [[60, 90, 0], [160, 130, 5], [300, 80, 3]],
        [[30, 40, 3]],
        [],
        [[0, 160, 4]],
        [[0, 100, 0], [110, 200, 1]],
      ];
      const rows = lines
        .map((tokens, i) => {
          const y = 120 + i * 48;
          const bars = tokens.map(([x, w, col]) => `<rect x="${110 + x}" y="${y - 14}" width="${w}" height="16" rx="8" style="fill:${palette[col]};opacity:0.9"/>`).join("");
          return `<g class="code-line" id="code-line-${i + 1}">${text(70, y, String(i + 1), { size: 18, weight: 500, family: MONO, color: c("muted"), anchor: "end", opacity: 0.6 })}${bars}</g>`;
        })
        .join("\n");
      return svg({
        w: 1200,
        h: 760,
        title: "Code editor window",
        body: `<path d="${roundRect(0, 0, 1200, 760, 18)}" style="fill:${c("term-bg", "#0F1117")}"/>
<path d="M0 18 A18 18 0 0 1 18 0 H1182 A18 18 0 0 1 1200 18 V56 H0Z" style="fill:${chrome}"/>
${dots(32, 28)}
<rect x="120" y="10" width="180" height="46" rx="8" style="fill:${c("term-bg", "#0F1117")}"/>
${text(144, 41, "index.ts", { size: 19, weight: 500, family: MONO, color: c("ink"), id: "filename" })}
<rect x="0" y="56" width="90" height="704" style="fill:${chrome};opacity:0.5"/>
${rows}`,
      });
    },
  },
  {
    ...BASE,
    stem: "cursor-arrow",
    name: "Mouse cursor (arrow)",
    w: 64,
    h: 80,
    tags: ["cursor", "pointer", "mouse", "arrow", "click", "ui", "demo"],
    description: "Classic white arrow cursor with a dark outline. Hotspot is the tip at (8,4) of 64x80: set transform-origin there. Move it along purposeful arcs to the target (never straight robotic lines), dip scale to 0.9 on click, pair with click-ripple.",
    svg: () => svg({ w: 64, h: 80, title: "Mouse cursor", body: `<path d="M8 4 V62 L22 49 L32 72 L43 67 L33 45 H52Z" style="fill:#fff;stroke:#111;stroke-width:3.5;stroke-linejoin:round"/>` }),
  },
  {
    ...BASE,
    stem: "cursor-hand",
    name: "Mouse cursor (pointing hand)",
    w: 80,
    h: 96,
    tags: ["cursor", "hand", "pointer", "link", "click", "ui", "demo"],
    description: "Pointing-hand cursor (link hover). Hotspot is the fingertip at (38,6) of 80x96. Swap from cursor-arrow to this when hovering a button.",
    svg: () => {
      const parts = [
        `<rect x="30" y="4" width="18" height="52" rx="9"/>`,
        `<rect x="46" y="30" width="16" height="34" rx="8"/>`,
        `<rect x="59" y="36" width="15" height="30" rx="7.5"/>`,
        `<path d="M14 56 Q8 50 12 44 Q18 38 26 46 L32 54 V40 H74 V70 Q74 92 52 92 H40 Q28 92 22 80Z"/>`,
      ];
      return svg({
        w: 80,
        h: 96,
        title: "Pointing hand cursor",
        body: `<g style="fill:#111;stroke:#111;stroke-width:7;stroke-linejoin:round">${parts.join("")}</g><g style="fill:#fff">${parts.join("")}</g><path d="M48 42 V56 M61 46 V58" style="fill:none;stroke:#111;stroke-width:2.5;stroke-linecap:round"/>`,
      });
    },
  },
  {
    ...BASE,
    stem: "click-ripple",
    name: "Click ripple",
    w: 200,
    h: 200,
    tags: ["click", "ripple", "tap", "touch", "feedback", "cursor", "ui"],
    description: "Concentric click/tap feedback: #dot plus #ring-1..#ring-3. On the click frame: scale rings 0.3 to 1 with opacity 1 to 0, staggered 0.06s, once.",
    svg: () =>
      svg({
        w: 200,
        h: 200,
        title: "Click ripple",
        body: `${[1, 2, 3].map((i) => `<circle id="ring-${i}" cx="100" cy="100" r="${30 + i * 22}" style="fill:none;stroke:${c("accent")};stroke-width:${6 - i};opacity:${f(1 - i * 0.22)}"/>`).join("")}<circle id="dot" cx="100" cy="100" r="16" style="fill:${c("accent")}"/>`,
      }),
  },
  {
    ...BASE,
    stem: "notification-toast",
    name: "Notification toast",
    w: 760,
    h: 170,
    tags: ["notification", "toast", "alert", "push", "banner", "message", "ui"],
    description: "Generic push-notification card: app tile (#app-icon), <text id=\"title\">, <text id=\"body\">, <text id=\"time\">. Drop it in from the top with a short overshoot; stack several to show volume.",
    svg: (id) =>
      svg({
        w: 760,
        h: 170,
        title: "Notification toast",
        defs: `${linear(`${id}-tile`, [["0", c("accent")], ["1", c("accent-2")]], { x1: "0", y1: "0", x2: "1", y2: "1" })}${blurFilter(`${id}-sh`, 14)}`,
        body: `<rect x="16" y="24" width="728" height="134" rx="30" style="fill:#000;opacity:0.35;filter:url(#${id}-sh)"/>
<rect x="8" y="8" width="744" height="148" rx="30" style="fill:${c("ui-panel", "#1E2027")};fill-opacity:0.96;stroke:${line};stroke-width:2"/>
<rect id="app-icon" x="34" y="34" width="96" height="96" rx="24" style="fill:url(#${id}-tile)"/>
<path d="M82 52 C86 72 92 78 112 82 C92 86 86 92 82 112 C78 92 72 86 52 82 C72 78 78 72 82 52Z" style="fill:#fff"/>
${text(156, 74, "New message", { size: 30, weight: 700, color: c("ink"), id: "title" })}
${text(156, 116, "Your video is ready to share.", { size: 26, weight: 400, color: c("muted"), id: "body" })}
${text(716, 72, "now", { size: 22, weight: 500, color: c("muted"), anchor: "end", id: "time" })}`,
      }),
  },
  {
    ...BASE,
    stem: "chat-thread",
    name: "Chat thread",
    w: 900,
    h: 620,
    tags: ["chat", "message", "bubbles", "conversation", "assistant", "ai", "dm", "imessage"],
    description: "Three-message chat: #msg-1 incoming (left), #msg-2 outgoing (right, --accent), #msg-3 typing indicator (#typing-1..3 dots). Each .msg slides up 0.1s apart; replace the copy (<text id=\"text-1\">, \"text-2\") with real lines.",
    svg: () =>
      svg({
        w: 900,
        h: 620,
        title: "Chat thread",
        body: `<g class="msg" id="msg-1"><path d="${roundRect(20, 30, 620, 110, 40)}" style="fill:${c("ui-panel", "#23252D")}"/>${text(58, 98, "Can you make a 10s launch teaser?", { size: 30, weight: 500, color: c("ink"), id: "text-1" })}</g>
<g class="msg" id="msg-2"><path d="${roundRect(320, 200, 560, 110, 40)}" style="fill:${c("accent")}"/>${text(358, 268, "On it. Rendering now.", { size: 30, weight: 600, color: "#fff", id: "text-2" })}</g>
<g class="msg" id="msg-3"><path d="${roundRect(20, 370, 170, 90, 45)}" style="fill:${c("ui-panel", "#23252D")}"/>${[0, 1, 2].map((i) => `<circle id="typing-${i + 1}" cx="${70 + i * 35}" cy="415" r="11" style="fill:${c("muted")}"/>`).join("")}</g>`,
      }),
  },
  {
    ...BASE,
    stem: "search-bar",
    name: "Search / command bar",
    w: 1000,
    h: 130,
    tags: ["search", "command", "bar", "input", "prompt", "query", "ui", "ai prompt"],
    description: "Rounded search/command input: magnifier, <text id=\"query\"> placeholder, #caret, and a ⌘K hint. For prompt-typing beats: type the real prompt into #query, keep #caret right after the last character.",
    svg: () =>
      svg({
        w: 1000,
        h: 130,
        title: "Search bar",
        body: `<rect x="5" y="5" width="990" height="120" rx="60" style="fill:${c("ui-panel", "#1E2027")};stroke:${line};stroke-width:3"/>
<circle cx="78" cy="61" r="20" style="fill:none;stroke:${c("muted")};stroke-width:5"/><path d="M93 76 L108 91" style="fill:none;stroke:${c("muted")};stroke-width:5;stroke-linecap:round"/>
${text(136, 78, "Ask anything…", { size: 36, weight: 400, color: c("muted"), id: "query" })}
<rect id="caret" x="132" y="44" width="3" height="44" style="fill:${c("accent")}"/>
<rect x="852" y="38" width="104" height="54" rx="14" style="fill:none;stroke:${line};stroke-width:3"/>${text(904, 75, "⌘K", { size: 26, weight: 600, color: c("muted"), anchor: "middle" })}`,
      }),
  },
  {
    ...BASE,
    stem: "button-primary",
    name: "Primary button",
    w: 440,
    h: 130,
    tags: ["button", "cta", "call to action", "click", "primary", "ui", "get started"],
    description: "Pill CTA button in --accent with <text id=\"label\"> and an arrow (#arrow). On the click beat: scale 0.96 then back, and nudge #arrow right 8px.",
    svg: (id) =>
      svg({
        w: 440,
        h: 130,
        title: "Primary button",
        defs: blurFilter(`${id}-glow`, 14),
        body: `<rect x="30" y="34" width="380" height="80" rx="40" style="fill:${c("accent")};opacity:0.45;filter:url(#${id}-glow)"/>
<rect x="10" y="10" width="420" height="104" rx="52" style="fill:${c("accent")}"/>
${text(190, 74, "Get started", { size: 34, weight: 700, color: "#fff", anchor: "middle", id: "label" })}
<path id="arrow" d="M330 62 H368 M352 46 L368 62 L352 78" style="fill:none;stroke:#fff;stroke-width:5;stroke-linecap:round;stroke-linejoin:round"/>`,
      }),
  },
  {
    ...BASE,
    stem: "toggle",
    name: "Toggle switch",
    w: 240,
    h: 130,
    tags: ["toggle", "switch", "on off", "setting", "enable", "ui"],
    description: "Toggle in the ON state: #track (--accent) and #knob. For the switching beat start OFF (knob translateX(-110px), track fill --muted) and tween to this state in 0.25s.",
    svg: () =>
      svg({
        w: 240,
        h: 130,
        title: "Toggle switch",
        body: `<rect id="track" x="5" y="5" width="230" height="120" rx="60" style="fill:${c("accent")}"/><circle id="knob" cx="175" cy="65" r="48" style="fill:#fff"/>`,
      }),
  },
  {
    ...BASE,
    stem: "progress-bar",
    name: "Progress bar",
    w: 1000,
    h: 120,
    tags: ["progress", "loading", "bar", "upload", "export", "percent", "ui"],
    description: "Labelled progress bar: <text id=\"label\">, <text id=\"percent\">, #track and #fill (full width). Animate #fill scaleX 0 to 1 (transform-origin: left) and count #percent up in sync.",
    svg: () =>
      svg({
        w: 1000,
        h: 120,
        title: "Progress bar",
        body: `${text(0, 34, "Rendering", { size: 30, weight: 600, color: c("ink"), id: "label" })}
${text(1000, 34, "100%", { size: 30, weight: 700, color: c("ink"), anchor: "end", id: "percent" })}
<rect id="track" x="0" y="64" width="1000" height="28" rx="14" style="fill:${c("ui-line", "#2C2F38")}"/>
<rect id="fill" x="0" y="64" width="1000" height="28" rx="14" style="fill:${c("accent")}"/>`,
      }),
  },
  {
    ...BASE,
    stem: "spinner",
    name: "Loading spinner",
    w: 160,
    h: 160,
    tags: ["spinner", "loading", "loader", "wait", "progress", "ui"],
    description: "Track ring plus a 90-degree arc (#arc). Rotate #arc around the center for the wait beat (a fixed number of turns over the beat, linear), then swap to a check.",
    svg: () =>
      svg({
        w: 160,
        h: 160,
        title: "Loading spinner",
        body: `<circle cx="80" cy="80" r="62" style="fill:none;stroke:${c("ui-line", "#2C2F38")};stroke-width:14"/><path id="arc" d="M80 18 A62 62 0 0 1 142 80" style="fill:none;stroke:${c("accent")};stroke-width:14;stroke-linecap:round"/>`,
      }),
  },
  {
    ...BASE,
    stem: "checklist",
    name: "Checklist",
    w: 760,
    h: 380,
    tags: ["checklist", "todo", "tasks", "features", "list", "done", "ui"],
    description: "Three checkbox rows: #box-1..3, draw-on checks #check-1..3, <text id=\"item-1..3\">. Tick them in sequence (draw each check 0.25s, 0.3s apart). Replace items with real features.",
    svg: () =>
      svg({
        w: 760,
        h: 380,
        title: "Checklist",
        body: range(3)
          .map((i) => {
            const y = 40 + i * 120;
            return `<rect id="box-${i + 1}" x="10" y="${y}" width="72" height="72" rx="18" style="fill:${c("accent-3")}"/>
${drawStroke(`M28 ${y + 37} L42 ${y + 51} L66 ${y + 22}`, { width: 9, color: "#fff", id: `check-${i + 1}` })}
${text(116, y + 50, ["Capture the site", "Build the film", "Ship the render"][i], { size: 38, weight: 600, color: c("ink"), id: `item-${i + 1}` })}`;
          })
          .join("\n"),
      }),
  },
  {
    ...BASE,
    stem: "social-post",
    name: "Social post card",
    w: 960,
    h: 540,
    tags: ["social", "post", "tweet", "testimonial", "card", "review", "quote", "feed"],
    description: "Platform-neutral social post card: #avatar, <text id=\"name\">, \"handle\", \"line-1\", \"line-2\", and stats (#likes count). Use for testimonials with real quotes only; count #likes up as the card lands.",
    svg: (id) =>
      svg({
        w: 960,
        h: 540,
        title: "Social post card",
        defs: linear(`${id}-av`, [["0", c("accent")], ["1", c("accent-2")]], { x1: "0", y1: "0", x2: "1", y2: "1" }),
        body: `<rect x="4" y="4" width="952" height="532" rx="34" style="fill:${c("ui-panel", "#16181D")};stroke:${line};stroke-width:2"/>
<circle id="avatar" cx="96" cy="100" r="46" style="fill:url(#${id}-av)"/>
${text(166, 92, "Alex Rivera", { size: 32, weight: 700, color: c("ink"), id: "name" })}
${text(166, 130, "@alexmakes · 2h", { size: 26, weight: 400, color: c("muted"), id: "handle" })}
${text(52, 226, "Made our launch video in ten minutes.", { size: 40, weight: 500, color: c("ink"), id: "line-1" })}
${text(52, 284, "The motion feels hand-made. Wild.", { size: 40, weight: 500, color: c("ink"), id: "line-2" })}
<path d="M52 360 H908" style="stroke:${line};stroke-width:2"/>
<path d="M60 420 h34 a8 8 0 0 1 8 8 v14 a8 8 0 0 1 -8 8 h-20 l-10 10 v-10 h-4 a8 8 0 0 1 -8 -8 v-14 a8 8 0 0 1 8 -8z" style="fill:none;stroke:${c("muted")};stroke-width:3"/>
${text(118, 446, "184", { size: 26, weight: 500, color: c("muted"), id: "replies" })}
<path d="M300 446 c-14 -12 -26 -20 -26 -32 a13 13 0 0 1 26 -6 a13 13 0 0 1 26 6 c0 12 -12 20 -26 32z" style="fill:${c("accent")}"/>
${text(340, 446, "2.4K", { size: 26, weight: 600, color: c("accent"), id: "likes" })}`,
      }),
  },
  {
    ...BASE,
    stem: "video-player",
    name: "Video player controls",
    w: 1280,
    h: 150,
    tags: ["video", "player", "controls", "scrubber", "playback", "timeline", "youtube"],
    description: "Player control bar: play icon (#play), #track, #played (scaleX from left), #playhead, <text id=\"time\">. Scrub #played/#playhead together to imply playback.",
    svg: () =>
      svg({
        w: 1280,
        h: 150,
        title: "Video player controls",
        body: `<rect x="0" y="0" width="1280" height="150" rx="26" style="fill:#000;opacity:0.55"/>
<path id="play" d="M50 50 L50 100 L92 75Z" style="fill:#fff"/>
<rect id="track" x="140" y="69" width="860" height="12" rx="6" style="fill:#fff;opacity:0.3"/>
<rect id="played" x="140" y="69" width="380" height="12" rx="6" style="fill:${c("accent")}"/>
<circle id="playhead" cx="520" cy="75" r="16" style="fill:#fff"/>
${text(1030, 86, "0:42 / 2:10", { size: 28, weight: 500, color: "#fff", id: "time" })}`,
      }),
  },
  {
    ...BASE,
    stem: "modal",
    name: "Modal dialog",
    w: 820,
    h: 500,
    tags: ["modal", "dialog", "popup", "confirm", "ui", "alert"],
    description: "Dialog card: <text id=\"title\">, \"body\", #btn-secondary, #btn-primary (with <text id=\"primary-label\">). Scale it in from 0.94 with a fade over a dimmed scene.",
    svg: (id) =>
      svg({
        w: 820,
        h: 500,
        title: "Modal dialog",
        defs: blurFilter(`${id}-sh`, 24),
        body: `<rect x="30" y="40" width="760" height="440" rx="32" style="fill:#000;opacity:0.45;filter:url(#${id}-sh)"/>
<rect x="10" y="10" width="800" height="460" rx="32" style="fill:${c("ui-panel", "#1C1E25")};stroke:${line};stroke-width:2"/>
${text(60, 100, "Publish this video?", { size: 42, weight: 700, color: c("ink"), id: "title" })}
${text(60, 160, "It will be visible to everyone with the link.", { size: 28, weight: 400, color: c("muted"), id: "body" })}
<rect id="btn-secondary" x="330" y="350" width="200" height="76" rx="38" style="fill:none;stroke:${line};stroke-width:3"/>${text(430, 399, "Cancel", { size: 28, weight: 600, color: c("ink"), anchor: "middle" })}
<rect id="btn-primary" x="550" y="350" width="210" height="76" rx="38" style="fill:${c("accent")}"/>${text(655, 399, "Publish", { size: 28, weight: 700, color: "#fff", anchor: "middle", id: "primary-label" })}`,
      }),
  },
  {
    ...BASE,
    stem: "avatar-stack",
    name: "Avatar stack",
    w: 520,
    h: 140,
    tags: ["avatars", "team", "users", "community", "collaboration", "social proof"],
    description: "Four overlapping initial avatars (#avatar-1..4) and a +12 bubble (#more). Slide each in from the left 0.05s apart for 'join thousands' / team moments.",
    svg: () => {
      const cols = [c("accent"), c("accent-2"), c("accent-3"), c("highlight")];
      const ini = ["AR", "MK", "JS", "PL"];
      const av = range(4)
        .map((i) => `<g id="avatar-${i + 1}"><circle cx="${70 + i * 90}" cy="70" r="62" style="fill:${cols[i]};stroke:${c("surface")};stroke-width:8"/>${text(70 + i * 90, 82, ini[i], { size: 34, weight: 700, color: i === 3 ? "#111" : "#fff", anchor: "middle" })}</g>`)
        .join("");
      return svg({ w: 520, h: 140, title: "Avatar stack", body: `${av}<g id="more"><circle cx="430" cy="70" r="62" style="fill:${c("ui-panel", "#23252D")};stroke:${c("surface")};stroke-width:8"/>${text(430, 82, "+12", { size: 32, weight: 700, color: c("ink"), anchor: "middle" })}</g>` });
    },
  },
  {
    ...BASE,
    stem: "keycap",
    name: "Keyboard keycap",
    w: 180,
    h: 180,
    tags: ["keyboard", "key", "shortcut", "keycap", "hotkey", "command", "productivity"],
    description: "3D-ish keycap with <text id=\"label\">⌘</text>. Show shortcuts (duplicate for ⌘ + K); on the press beat move #cap down 6px and back.",
    svg: () =>
      svg({
        w: 180,
        h: 180,
        title: "Keyboard keycap",
        body: `<rect x="10" y="22" width="160" height="150" rx="30" style="fill:${c("key-base", "#0B0C0F")}"/>
<g id="cap"><rect x="10" y="8" width="160" height="150" rx="30" style="fill:${c("key-side", "#2A2D35")}"/><rect x="22" y="14" width="136" height="122" rx="22" style="fill:${c("key-top", "#3A3E48")}"/>${text(90, 100, "⌘", { size: 64, weight: 600, color: c("ink"), anchor: "middle", id: "label" })}</g>`,
      }),
  },
  {
    ...BASE,
    stem: "app-icon",
    name: "App icon tile",
    w: 256,
    h: 256,
    tags: ["app icon", "icon", "tile", "app", "launcher", "gradient"],
    description: "Rounded gradient app tile with a sparkle glyph (#glyph). A placeholder for 'the app' only when the brief has no real icon; swap #glyph for a library icon.",
    svg: (id) =>
      svg({
        w: 256,
        h: 256,
        title: "App icon tile",
        defs: linear(`${id}-g`, [["0", c("accent")], ["1", c("accent-2")]], { x1: "0", y1: "0", x2: "1", y2: "1" }),
        body: `<rect x="8" y="8" width="240" height="240" rx="56" style="fill:url(#${id}-g)"/><path id="glyph" d="M128 52 C136 104 152 120 204 128 C152 136 136 152 128 204 C120 152 104 136 52 128 C104 120 120 104 128 52Z" style="fill:#fff"/>`,
      }),
  },
  {
    ...BASE,
    stem: "pricing-card",
    name: "Pricing card",
    w: 620,
    h: 800,
    tags: ["pricing", "plan", "price", "subscription", "card", "saas", "tier"],
    description: "Pricing tier card: <text id=\"plan\">, \"price\", \"period\", features #feature-1..4 with draw-on checks, #cta. Only show real plans and prices from the brief or capture.",
    svg: () =>
      svg({
        w: 620,
        h: 800,
        title: "Pricing card",
        body: `<rect x="4" y="4" width="612" height="792" rx="36" style="fill:${c("ui-panel", "#16181D")};stroke:${c("accent")};stroke-width:3"/>
${text(56, 104, "Pro", { size: 38, weight: 700, color: c("accent"), id: "plan" })}
${text(56, 210, "$29", { size: 96, weight: 800, color: c("ink"), id: "price" })}
${text(236, 210, "/ month", { size: 30, weight: 500, color: c("muted"), id: "period" })}
${range(4)
  .map((i) => `${drawStroke(`M60 ${310 + i * 76} l12 12 l24 -26`, { width: 7, color: c("accent-3"), id: `check-${i + 1}` })}${text(116, 322 + i * 76, ["Unlimited projects", "4K exports", "Brand kits", "Priority renders"][i], { size: 32, weight: 500, color: c("ink"), id: `feature-${i + 1}` })}`)
  .join("\n")}
<rect id="cta" x="56" y="660" width="508" height="92" rx="46" style="fill:${c("accent")}"/>${text(310, 718, "Choose Pro", { size: 32, weight: 700, color: "#fff", anchor: "middle", id: "cta-label" })}`,
      }),
  },
  {
    ...BASE,
    stem: "context-menu",
    name: "Context menu",
    w: 440,
    h: 380,
    tags: ["menu", "context menu", "dropdown", "right click", "options", "ui"],
    description: "Dropdown/context menu with five items (<text id=\"item-1..5\">) and a highlighted row (#hover on item 2). Move #hover between rows on the cursor beat.",
    svg: (id) =>
      svg({
        w: 440,
        h: 380,
        title: "Context menu",
        defs: blurFilter(`${id}-sh`, 16),
        body: `<rect x="20" y="24" width="400" height="340" rx="22" style="fill:#000;opacity:0.4;filter:url(#${id}-sh)"/>
<rect x="10" y="10" width="420" height="356" rx="22" style="fill:${c("ui-panel", "#1E2027")};stroke:${line};stroke-width:2"/>
<rect id="hover" x="22" y="90" width="396" height="62" rx="14" style="fill:${c("accent")}"/>
${["Duplicate", "Export as MP4", "Share link", "Rename", "Delete"].map((t, i) => text(48, 72 + i * 66, t, { size: 28, weight: 500, color: i === 1 ? "#fff" : i === 4 ? c("accent") : c("ink"), id: `item-${i + 1}` })).join("\n")}
<path d="M30 296 H410" style="stroke:${line};stroke-width:2"/>`,
      }),
  },
  {
    ...BASE,
    stem: "tooltip",
    name: "Tooltip",
    w: 440,
    h: 160,
    tags: ["tooltip", "hint", "label", "hover", "callout", "ui"],
    description: "Dark tooltip with a pointer at bottom center (tip at 220,152) and <text id=\"label\">. Pop it above the element the cursor hovers (scale 0.9 to 1 from the tip).",
    svg: () =>
      svg({
        w: 440,
        h: 160,
        title: "Tooltip",
        body: `<path d="${roundRect(4, 4, 432, 112, 22)}" style="fill:${c("tooltip", "#F5F3EE")}"/><path d="M196 114 L220 152 L244 114Z" style="fill:${c("tooltip", "#F5F3EE")}"/>${text(220, 72, "Click to generate", { size: 32, weight: 600, color: c("tooltip-ink", "#111216"), anchor: "middle", id: "label" })}`,
      }),
  },
];
