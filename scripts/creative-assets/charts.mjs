// Data-viz templates (transparent): bars, lines, rings, gauges. Every value-bearing part has an id, so
// the film animates real numbers from the brief. Never show numbers the brief doesn't support.
import { arcPath, c, drawStroke, f, FONT, linear, range, smoothOpen, svg, text } from "./lib.mjs";

const BASE = { kind: "chart" };
const grid = c("ui-line", "#2C2F38");

export default [
  {
    ...BASE,
    stem: "bar-vertical",
    name: "Vertical bar chart",
    w: 1200,
    h: 700,
    tags: ["bar chart", "column", "growth", "data", "comparison", "stats", "vertical"],
    description: "Six columns (#bar-1..6, each with <text id=\"val-n\"> and \"cat-n\"). Grow bars with scaleY 0 to 1 (transform-box: fill-box; transform-origin: bottom), staggered 0.06s, and count the values up. Set real heights by editing each bar's y/height.",
    svg: () => {
      const vals = [38, 52, 47, 66, 74, 92];
      const bars = vals
        .map((v, i) => {
          const h = v * 5.4;
          const x = 110 + i * 175;
          return `<rect id="bar-${i + 1}" class="bar" x="${x}" y="${600 - h}" width="110" height="${h}" rx="12" style="fill:${i === 5 ? c("accent") : c("accent-2")};transform-box:fill-box;transform-origin:bottom"/>
${text(x + 55, 600 - h - 22, String(v), { size: 30, weight: 700, color: c("ink"), anchor: "middle", id: `val-${i + 1}` })}
${text(x + 55, 650, ["Jan", "Feb", "Mar", "Apr", "May", "Jun"][i], { size: 26, weight: 500, color: c("muted"), anchor: "middle", id: `cat-${i + 1}` })}`;
        })
        .join("\n");
      return svg({ w: 1200, h: 700, title: "Vertical bar chart", body: `${[150, 300, 450].map((y) => `<path d="M80 ${y} H1170" style="stroke:${grid};stroke-width:2;stroke-dasharray:6 10"/>`).join("")}<path d="M80 600 H1170" style="stroke:${c("muted")};stroke-width:3"/>\n${bars}` });
    },
  },
  {
    ...BASE,
    stem: "bar-horizontal",
    name: "Horizontal bar chart",
    w: 1200,
    h: 640,
    tags: ["bar chart", "horizontal", "ranking", "leaderboard", "comparison", "data"],
    description: "Five ranked rows: <text id=\"label-n\">, #bar-n (grow scaleX from the left: transform-origin left), <text id=\"val-n\">. Ideal for 'us vs them' rankings with the brand's row in --accent.",
    svg: () => {
      const rows = [
        ["Ours", 92],
        ["Tool B", 61],
        ["Tool C", 48],
        ["Tool D", 35],
        ["Tool E", 22],
      ];
      return svg({
        w: 1200,
        h: 640,
        title: "Horizontal bar chart",
        body: rows
          .map(([label, v], i) => {
            const y = 40 + i * 120;
            const w = v * 9;
            return `${text(0, y + 52, label, { size: 32, weight: 600, color: i === 0 ? c("ink") : c("muted"), id: `label-${i + 1}` })}
<rect id="bar-${i + 1}" class="bar" x="200" y="${y + 10}" width="${w}" height="64" rx="14" style="fill:${i === 0 ? c("accent") : c("ui-line", "#3A3E48")};transform-box:fill-box;transform-origin:left"/>
${text(220 + w, y + 54, `${v}%`, { size: 30, weight: 700, color: c("ink"), id: `val-${i + 1}` })}`;
          })
          .join("\n"),
      });
    },
  },
  {
    ...BASE,
    stem: "line-chart",
    name: "Line chart with area",
    w: 1200,
    h: 700,
    tags: ["line chart", "trend", "growth", "graph", "area", "data", "revenue"],
    description: "Growth line: #line (draw-on dash) over #area (gradient fill), points .dot (#dot-1..8), end label <text id=\"end-value\">. Draw #line left to right (0.8-1.2s), fade #area in behind it, pop the last dot and value.",
    svg: (id) => {
      const vals = [120, 160, 150, 220, 260, 250, 340, 430];
      const pts = vals.map((v, i) => [100 + i * 145, 620 - v]);
      const d = smoothOpen(pts, 0.8);
      return svg({
        w: 1200,
        h: 700,
        title: "Line chart",
        defs: linear(`${id}-area`, [["0", c("accent"), 0.45], ["1", c("accent"), 0]], { x1: "0", y1: "0", x2: "0", y2: "1" }),
        body: `${[170, 320, 470].map((y) => `<path d="M80 ${y} H1160" style="stroke:${grid};stroke-width:2;stroke-dasharray:6 10"/>`).join("")}<path d="M80 620 H1160" style="stroke:${c("muted")};stroke-width:3"/>
<path id="area" d="${d} L${pts[pts.length - 1][0]} 620 L${pts[0][0]} 620Z" style="fill:url(#${id}-area)"/>
${drawStroke(d, { width: 8, id: "line" })}
${pts.map(([x, y], i) => `<circle id="dot-${i + 1}" class="dot" cx="${f(x)}" cy="${f(y)}" r="${i === pts.length - 1 ? 14 : 8}" style="fill:${i === pts.length - 1 ? c("accent") : c("ink")}"/>`).join("")}
${text(pts[7][0] - 20, pts[7][1] - 34, "+258%", { size: 40, weight: 800, color: c("accent"), anchor: "end", id: "end-value" })}`,
      });
    },
  },
  {
    ...BASE,
    stem: "donut",
    name: "Donut chart",
    w: 600,
    h: 600,
    tags: ["donut", "pie", "share", "percentage", "breakdown", "data", "ring chart"],
    description: "Four-segment donut (#seg-1..4, each a circle with pathLength=100: its share is the dash length) and a center <text id=\"center-value\">. Sweep each segment on by tweening stroke-dasharray from '0 100' to 'share 100' in sequence.",
    svg: () => {
      const shares = [42, 26, 18, 14];
      const cols = [c("accent"), c("accent-2"), c("accent-3"), c("highlight")];
      let offset = 0;
      const segs = shares
        .map((s, i) => {
          const el = `<circle id="seg-${i + 1}" class="seg" cx="300" cy="300" r="210" pathLength="100" transform="rotate(-90 300 300)" style="fill:none;stroke:${cols[i]};stroke-width:84;stroke-dasharray:${s - 0.8} ${100 - s + 0.8};stroke-dashoffset:${-offset}"/>`;
          offset += s;
          return el;
        })
        .join("");
      return svg({ w: 600, h: 600, title: "Donut chart", body: `${segs}${text(300, 312, "42%", { size: 84, weight: 800, color: c("ink"), anchor: "middle", id: "center-value" })}${text(300, 362, "of users", { size: 30, weight: 500, color: c("muted"), anchor: "middle", id: "center-label" })}` });
    },
  },
  {
    ...BASE,
    stem: "progress-ring",
    name: "Progress ring",
    w: 400,
    h: 400,
    tags: ["progress", "ring", "percent", "goal", "kpi", "radial", "completion"],
    description: "Radial progress: #track and #arc (pathLength=100, currently 75). Tween #arc stroke-dasharray from '0 100' to 'N 100' while counting <text id=\"value\"> up to N.",
    svg: () =>
      svg({
        w: 400,
        h: 400,
        title: "Progress ring",
        body: `<circle id="track" cx="200" cy="200" r="160" style="fill:none;stroke:${grid};stroke-width:36"/>
<circle id="arc" cx="200" cy="200" r="160" pathLength="100" transform="rotate(-90 200 200)" style="fill:none;stroke:${c("accent")};stroke-width:36;stroke-linecap:round;stroke-dasharray:75 100"/>
${text(200, 222, "75%", { size: 76, weight: 800, color: c("ink"), anchor: "middle", id: "value" })}`,
      }),
  },
  {
    ...BASE,
    stem: "gauge",
    name: "Speed gauge",
    w: 640,
    h: 400,
    tags: ["gauge", "speedometer", "meter", "performance", "speed", "score", "dial"],
    description: "Half-circle gauge with three zones and a needle (#needle, pivot at 320,340). Rotate #needle from -90 to the value's angle (+90 = max) with a short overshoot; count <text id=\"value\"> in sync.",
    svg: () =>
      svg({
        w: 640,
        h: 400,
        title: "Speed gauge",
        body: `<path d="${arcPath(320, 340, 250, -90, -30)}" style="fill:none;stroke:${c("accent")};stroke-width:44;opacity:0.45"/>
<path d="${arcPath(320, 340, 250, -28, 28)}" style="fill:none;stroke:${c("highlight")};stroke-width:44;opacity:0.6"/>
<path d="${arcPath(320, 340, 250, 30, 90)}" style="fill:none;stroke:${c("accent-3")};stroke-width:44"/>
<g id="needle" style="transform-origin:320px 340px;transform:rotate(60deg)"><path d="M314 340 L320 120 L326 340Z" style="fill:${c("ink")}"/></g>
<circle cx="320" cy="340" r="22" style="fill:${c("ink")}"/>
${text(320, 300, "98", { size: 64, weight: 800, color: c("ink"), anchor: "middle", id: "value" })}`,
      }),
  },
  {
    ...BASE,
    stem: "sparkline",
    name: "Sparkline",
    w: 400,
    h: 120,
    tags: ["sparkline", "mini chart", "trend", "kpi", "inline", "data"],
    description: "Compact trend line (#line, draw-on) with an end dot (#end). Sits next to a KPI number.",
    svg: () => {
      const pts = [20, 40, 30, 55, 48, 70, 62, 90].map((v, i) => [12 + i * 52, 110 - v]);
      return svg({ w: 400, h: 120, title: "Sparkline", body: `${drawStroke(smoothOpen(pts, 0.8), { width: 6, id: "line", color: c("accent-3") })}<circle id="end" cx="${pts[7][0]}" cy="${pts[7][1]}" r="9" style="fill:${c("accent-3")}"/>` });
    },
  },
  {
    ...BASE,
    stem: "stat-card",
    name: "Stat card",
    w: 640,
    h: 360,
    tags: ["stat", "kpi", "metric", "card", "number", "dashboard", "result"],
    description: "Big-number card: <text id=\"value\">, \"label\", trend chip (#trend with <text id=\"trend-value\">). Count #value up (snap to whole numbers) and pop #trend after it lands.",
    svg: () =>
      svg({
        w: 640,
        h: 360,
        title: "Stat card",
        body: `<rect x="4" y="4" width="632" height="352" rx="32" style="fill:${c("ui-panel", "#16181D")};stroke:${grid};stroke-width:2"/>
${text(52, 96, "Videos rendered", { size: 30, weight: 500, color: c("muted"), id: "label" })}
${text(52, 236, "12,480", { size: 112, weight: 800, color: c("ink"), id: "value" })}
<g id="trend"><rect x="52" y="272" width="190" height="56" rx="28" style="fill:${c("accent-3")};fill-opacity:0.16"/>${text(147, 310, "▲ 32%", { size: 28, weight: 700, color: c("accent-3"), anchor: "middle", id: "trend-value" })}</g>`,
      }),
  },
  ...[
    ["trend-up", "Trend up badge", "▲ +24%", c("accent-3"), ["up", "growth", "increase", "positive"]],
    ["trend-down", "Trend down badge", "▼ −12%", c("accent"), ["down", "decrease", "drop", "negative"]],
  ].map(([stem, name, label, col, tags]) => ({
    ...BASE,
    stem,
    name,
    w: 300,
    h: 110,
    tags: ["trend", "badge", "percent", "change", "kpi", ...tags],
    description: `Pill badge with <text id="value">${label}</text>. Pop it beside a number after the count-up lands.`,
    svg: () => svg({ w: 300, h: 110, title: name, body: `<rect x="4" y="4" width="292" height="102" rx="51" style="fill:${col};fill-opacity:0.16;stroke:${col};stroke-width:3"/>${text(150, 70, label, { size: 40, weight: 800, color: col, anchor: "middle", id: "value" })}` }),
  })),
  {
    ...BASE,
    stem: "funnel",
    name: "Funnel",
    w: 900,
    h: 720,
    tags: ["funnel", "conversion", "pipeline", "stages", "marketing", "sales"],
    description: "Four-stage funnel (#stage-1..4 with <text id=\"stage-label-n\">). Drop stages in from the top, 0.08s apart.",
    svg: () => {
      const stages = ["Visitors", "Sign-ups", "Active", "Paying"];
      const cols = [c("accent-2"), c("accent-2"), c("accent"), c("accent")];
      return svg({
        w: 900,
        h: 720,
        title: "Funnel",
        body: stages
          .map((s, i) => {
            const y = 20 + i * 172;
            const top = 860 - i * 170;
            const bot = 860 - (i + 1) * 170;
            const x0 = (900 - top) / 2;
            const x1 = (900 - bot) / 2;
            return `<path id="stage-${i + 1}" d="M${x0} ${y} H${x0 + top} L${x1 + bot} ${y + 156} H${x1}Z" style="fill:${cols[i]};opacity:${f(0.55 + i * 0.15)}"/>${text(450, y + 92, s, { size: 36, weight: 700, color: "#fff", anchor: "middle", id: `stage-label-${i + 1}` })}`;
          })
          .join("\n"),
      });
    },
  },
  {
    ...BASE,
    stem: "comparison-bars",
    name: "Before / after bars",
    w: 1000,
    h: 520,
    tags: ["comparison", "before after", "versus", "improvement", "time saved", "bars"],
    description: "Two bars (#before muted, #after --accent) with labels and values (<text id=\"before-value\">, \"after-value\"). Grow #before first, then #after, so the difference is the punchline.",
    svg: () =>
      svg({
        w: 1000,
        h: 520,
        title: "Before and after bars",
        body: `${text(0, 70, "Before", { size: 34, weight: 600, color: c("muted"), id: "before-label" })}
<rect id="before" x="0" y="100" width="900" height="110" rx="20" style="fill:${c("ui-line", "#3A3E48")};transform-box:fill-box;transform-origin:left"/>
${text(30, 172, "3 days", { size: 40, weight: 800, color: c("ink"), id: "before-value" })}
${text(0, 320, "After", { size: 34, weight: 600, color: c("ink"), id: "after-label" })}
<rect id="after" x="0" y="350" width="160" height="110" rx="20" style="fill:${c("accent")};transform-box:fill-box;transform-origin:left"/>
${text(190, 422, "10 min", { size: 40, weight: 800, color: c("accent"), id: "after-value" })}`,
      }),
  },
  {
    ...BASE,
    stem: "timeline-steps",
    name: "Timeline steps",
    w: 1500,
    h: 320,
    tags: ["timeline", "steps", "process", "roadmap", "milestones", "how it works", "journey"],
    description: "Four milestones on a line: #track (draw-on), nodes #node-1..4, <text id=\"step-n\"> titles. Draw the track left to right and pop each node as the line reaches it.",
    svg: () =>
      svg({
        w: 1500,
        h: 320,
        title: "Timeline steps",
        body: `${drawStroke("M80 120 H1420", { width: 6, id: "track", color: c("muted") })}
${["Paste a link", "Pick a style", "Generate", "Publish"]
  .map(
    (s, i) =>
      `<g id="node-${i + 1}"><circle cx="${80 + i * 446.7}" cy="120" r="34" style="fill:${i === 3 ? c("accent") : c("surface")};stroke:${c("accent")};stroke-width:6"/>${text(80 + i * 446.7, 132, String(i + 1), { size: 32, weight: 800, color: i === 3 ? "#fff" : c("accent"), anchor: "middle" })}</g>${text(80 + i * 446.7, 222, s, { size: 32, weight: 600, color: c("ink"), anchor: "middle", id: `step-${i + 1}` })}`,
  )
  .join("\n")}`,
      }),
  },
  {
    ...BASE,
    stem: "kpi-grid",
    name: "KPI grid",
    w: 1200,
    h: 700,
    tags: ["kpi", "dashboard", "metrics", "grid", "stats", "results", "numbers"],
    description: "2x2 metric tiles (#tile-1..4 with <text id=\"kpi-value-n\"> and \"kpi-label-n\"). Land tiles in a staggered grid order and count every value up.",
    svg: () => {
      const tiles = [
        ["10x", "faster edits"],
        ["4K", "exports"],
        ["120+", "templates"],
        ["24/7", "rendering"],
      ];
      return svg({
        w: 1200,
        h: 700,
        title: "KPI grid",
        body: tiles
          .map(([v, l], i) => {
            const x = (i % 2) * 610;
            const y = Math.floor(i / 2) * 360;
            return `<g id="tile-${i + 1}"><rect x="${x + 4}" y="${y + 4}" width="582" height="332" rx="30" style="fill:${c("ui-panel", "#16181D")};stroke:${grid};stroke-width:2"/>${text(x + 50, y + 190, v, { size: 120, weight: 800, color: i === 0 ? c("accent") : c("ink"), id: `kpi-value-${i + 1}` })}${text(x + 54, y + 262, l, { size: 34, weight: 500, color: c("muted"), id: `kpi-label-${i + 1}` })}</g>`;
          })
          .join("\n"),
      });
    },
  },
  {
    ...BASE,
    stem: "radar",
    name: "Radar chart",
    w: 640,
    h: 640,
    tags: ["radar", "spider", "skills", "comparison", "attributes", "profile"],
    description: "Five-axis radar: grid pentagons, axis labels (<text id=\"axis-1..5\">) and a data polygon #data. Scale #data from the center (transform-origin 320px 330px) 0 to 1.",
    svg: () => {
      const ax = 5;
      const pt = (i, r) => {
        const a = -Math.PI / 2 + (i / ax) * Math.PI * 2;
        return [320 + Math.cos(a) * r, 330 + Math.sin(a) * r];
      };
      const ring = (r) => `M${range(ax).map((i) => pt(i, r).map(f).join(" ")).join(" L")}Z`;
      const vals = [0.92, 0.7, 0.85, 0.6, 0.78];
      return svg({
        w: 640,
        h: 640,
        title: "Radar chart",
        body: `${[60, 120, 180, 240].map((r) => `<path d="${ring(r)}" style="fill:none;stroke:${grid};stroke-width:2"/>`).join("")}
<path id="data" d="M${vals.map((v, i) => pt(i, v * 240).map(f).join(" ")).join(" L")}Z" style="fill:${c("accent")};fill-opacity:0.35;stroke:${c("accent")};stroke-width:5;transform-origin:320px 330px"/>
${["Speed", "Quality", "Brand", "Cost", "Ease"].map((s, i) => {
  const [x, y] = pt(i, 285);
  return text(x, y + 10, s, { size: 28, weight: 600, color: c("ink"), anchor: "middle", id: `axis-${i + 1}` });
}).join("")}`,
      });
    },
  },
  {
    ...BASE,
    stem: "number-counter",
    name: "Number counter frame",
    w: 1000,
    h: 300,
    tags: ["counter", "count up", "number", "odometer", "stat", "milestone", "big number"],
    description: "Huge number (<text id=\"value\">) with a <text id=\"suffix\"> and an underline (#rule, draw-on). Count #value up with a snapping ease, draw #rule when it lands.",
    svg: () =>
      svg({
        w: 1000,
        h: 300,
        title: "Number counter",
        body: `${text(16, 196, "1,000,000", { size: 160, weight: 800, color: c("ink"), id: "value", spacing: "-4px" })}${text(24, 270, "videos made", { size: 40, weight: 500, color: c("muted"), id: "suffix" })}${drawStroke("M420 252 H980", { width: 10, id: "rule" })}`,
      }),
  },
];
