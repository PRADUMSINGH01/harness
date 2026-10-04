// Line icons (24-unit grid, 1.8 stroke, round caps, rendered at 96px): one consistent set, so a row of
// feature icons never mixes styles. Stroke color is --ink; every path also carries the draw-on dash,
// so an icon can draw itself in (tween .draw stroke-dashoffset 1.02 -> 0, ~0.5s).
import { c, f, range, starPoints } from "./lib.mjs";

const stroke = c("ink");

function icon(stem, name, tags, d, extra = "") {
  return {
    kind: "icon",
    stem,
    name: `${name} icon`,
    w: 96,
    h: 96,
    tags: ["icon", "line icon", "outline", ...tags],
    description: `Line icon: ${name.toLowerCase()}. Inline it to recolor (--ink) or draw it on; size every icon in a row identically (64-160px).`,
    svg: () =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="96" height="96" role="img" aria-label="${name}">\n<path class="draw" pathLength="1" d="${d}" style="fill:none;stroke:${stroke};stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1 1.05;stroke-dashoffset:0"/>${extra}\n</svg>\n`,
  };
}

const circle = (cx, cy, r) => `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0`;
const dot = (cx, cy, r = 1.2) => `<circle cx="${cx}" cy="${cy}" r="${r}" style="fill:${stroke}"/>`;

function gear() {
  const teeth = 8;
  const pts = [];
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const w = (Math.PI * 2) / teeth;
    for (const [da, r] of [
      [-0.3, 7],
      [-0.17, 9.6],
      [0.17, 9.6],
      [0.3, 7],
    ]) {
      const ang = a + da * w * 1.6;
      pts.push([12 + Math.cos(ang) * r, 12 + Math.sin(ang) * r]);
    }
  }
  return `M${pts.map((p) => `${f(p[0])} ${f(p[1])}`).join(" L")}Z ${circle(12, 12, 3)}`;
}

export default [
  icon("sparkles", "Sparkles (AI)", ["ai", "magic", "generate", "new", "sparkle"], "M10 3 C10.6 7.5 12.5 9.4 17 10 C12.5 10.6 10.6 12.5 10 17 C9.4 12.5 7.5 10.6 3 10 C7.5 9.4 9.4 7.5 10 3Z M18 14.5 C18.3 16.8 19.2 17.7 21.5 18 C19.2 18.3 18.3 19.2 18 21.5 C17.7 19.2 16.8 18.3 14.5 18 C16.8 17.7 17.7 16.8 18 14.5Z"),
  icon("play", "Play", ["play", "video", "start", "media"], "M7 4.5 L19 12 L7 19.5Z"),
  icon("pause", "Pause", ["pause", "stop", "media"], "M8 5 V19 M16 5 V19"),
  icon("video", "Video camera", ["video", "record", "camera", "film"], "M3 7 h11 a2 2 0 0 1 2 2 v6 a2 2 0 0 1 -2 2 h-11 a2 2 0 0 1 -2 -2 v-6 a2 2 0 0 1 2 -2z M16 10.5 L22 7.5 V16.5 L16 13.5"),
  icon("film", "Film strip", ["film", "movie", "cinema", "reel", "video"], "M5 4 h14 a2 2 0 0 1 2 2 v12 a2 2 0 0 1 -2 2 h-14 a2 2 0 0 1 -2 -2 v-12 a2 2 0 0 1 2 -2z M7 4 v16 M17 4 v16 M3 8 h4 M3 12 h4 M3 16 h4 M17 8 h4 M17 12 h4 M17 16 h4"),
  icon("wand", "Magic wand", ["magic", "wand", "auto", "ai", "enhance"], "M4 20 L15 9 M13 7 l4 4 M18 2.5 v3 M16.5 4 h3 M21 8.5 v2 M20 9.5 h2 M9 3.5 v2 M8 4.5 h2"),
  icon("layers", "Layers", ["layers", "stack", "composition", "design"], "M12 3 L21 8 L12 13 L3 8Z M3 12 L12 17 L21 12 M3 16 L12 21 L21 16"),
  icon("timeline", "Timeline", ["timeline", "editor", "tracks", "edit", "sequence"], "M3 5 h8 v4 h-8z M9 11 h12 v4 h-12z M5 17 h9 v4 h-9z M16 2 v20"),
  icon("rocket", "Rocket", ["rocket", "launch", "startup", "fast", "ship"], "M12 2.5 C16 4.5 18 8.5 17 13.5 L14.5 16.5 H9.5 L7 13.5 C6 8.5 8 4.5 12 2.5Z M7 13.5 L4 16 L6 19 L9.5 16.5 M17 13.5 L20 16 L18 19 L14.5 16.5 M10 19.5 L12 22 L14 19.5 " + circle(12, 9.5, 1.6)),
  icon("zap", "Lightning bolt", ["zap", "fast", "energy", "power", "instant", "lightning"], "M13 2 L4 14 H11 L10 22 L20 9 H13 L13 2Z"),
  icon("globe", "Globe", ["globe", "world", "web", "international", "global", "internet"], `${circle(12, 12, 9)} M3 12 h18 M12 3 C15 6 15 18 12 21 C9 18 9 6 12 3Z`),
  icon("lock", "Lock", ["lock", "secure", "security", "privacy", "private"], "M6 11 h12 a1 1 0 0 1 1 1 v8 a1 1 0 0 1 -1 1 h-12 a1 1 0 0 1 -1 -1 v-8 a1 1 0 0 1 1 -1z M8 11 V8 a4 4 0 0 1 8 0 v3 M12 15 v2"),
  icon("trending-up", "Trending up", ["growth", "trend", "up", "increase", "analytics", "chart"], "M3 17 L9 11 L13 15 L21 7 M15 7 h6 v6"),
  icon("user", "User", ["user", "person", "profile", "account"], `${circle(12, 8, 4)} M4 21 c0 -4 3.6 -6 8 -6 s8 2 8 6`),
  icon("users", "Users", ["users", "team", "people", "community", "group"], `${circle(9, 7.5, 3.5)} M2 20 c0 -3.5 3 -5.5 7 -5.5 s7 2 7 5.5 M16 4.5 a3.5 3.5 0 0 1 0 6.5 M18 14.5 c2.4 0.6 4 2.4 4 5.5`),
  icon("settings", "Settings gear", ["settings", "gear", "config", "preferences", "options"], gear()),
  icon("cloud", "Cloud", ["cloud", "storage", "sync", "online", "saas"], "M7 18 h10 a4 4 0 0 0 0.6 -7.95 a6 6 0 0 0 -11.4 -1.3 A4.5 4.5 0 0 0 7 18z"),
  icon("download", "Download", ["download", "export", "save", "get"], "M12 3 v12 M7 10 l5 5 l5 -5 M4 17 v2 a2 2 0 0 0 2 2 h12 a2 2 0 0 0 2 -2 v-2"),
  icon("upload", "Upload", ["upload", "import", "publish", "send"], "M12 15 V3 M7 8 l5 -5 l5 5 M4 17 v2 a2 2 0 0 0 2 2 h12 a2 2 0 0 0 2 -2 v-2"),
  icon("share", "Share", ["share", "network", "connect", "social"], `${circle(18, 5, 2.5)} ${circle(6, 12, 2.5)} ${circle(18, 19, 2.5)} M8.2 10.8 L15.8 6.2 M8.2 13.2 L15.8 17.8`),
  icon("heart", "Heart", ["heart", "like", "love", "favorite"], "M12 20 C5 15.5 2.5 12 2.5 8.5 a4.5 4.5 0 0 1 9.5 -2 a4.5 4.5 0 0 1 9.5 2 C21.5 12 19 15.5 12 20Z"),
  icon("star", "Star", ["star", "rating", "favorite", "review"], `M${starPoints(12, 12.6, 9.6, 4.2, 5).map((p) => `${f(p[0])} ${f(p[1])}`).join(" L")}Z`),
  icon("check-circle", "Check circle", ["check", "done", "success", "complete", "verified"], `${circle(12, 12, 9)} M8 12.5 l2.8 2.8 L16.5 9`),
  icon("clock", "Clock", ["clock", "time", "fast", "schedule", "duration"], `${circle(12, 12, 9)} M12 7 v5 l3.5 2`),
  icon("bell", "Bell", ["bell", "notification", "alert", "reminder"], "M6 16 V11 a6 6 0 0 1 12 0 v5 l1.5 2 H4.5Z M10 21 a2 2 0 0 0 4 0"),
  icon("message", "Message", ["message", "chat", "comment", "support", "conversation"], "M5 4 h14 a2 2 0 0 1 2 2 v9 a2 2 0 0 1 -2 2 H10 l-5 4 v-4 a2 2 0 0 1 -2 -2 V6 a2 2 0 0 1 2 -2z"),
  icon("code", "Code", ["code", "developer", "api", "programming", "embed"], "M8 7 L3 12 L8 17 M16 7 L21 12 L16 17 M14 4 L10 20"),
  icon("mail", "Mail", ["mail", "email", "inbox", "newsletter", "contact"], "M4 5 h16 a1 1 0 0 1 1 1 v12 a1 1 0 0 1 -1 1 h-16 a1 1 0 0 1 -1 -1 v-12 a1 1 0 0 1 1 -1z M3.5 6.5 L12 13 L20.5 6.5"),
  icon("search", "Search", ["search", "find", "explore", "discover", "magnifier"], `${circle(10.5, 10.5, 6.5)} M15.5 15.5 L21 21`),
  icon("calendar", "Calendar", ["calendar", "date", "schedule", "event", "plan"], "M5 5 h14 a2 2 0 0 1 2 2 v12 a2 2 0 0 1 -2 2 h-14 a2 2 0 0 1 -2 -2 v-12 a2 2 0 0 1 2 -2z M3 10 h18 M8 3 v4 M16 3 v4"),
  icon("shield", "Shield check", ["shield", "security", "safe", "trust", "protection"], "M12 3 L19 6 V11 C19 16 15.5 19.5 12 21 C8.5 19.5 5 16 5 11 V6Z M9 12 l2 2 l4 -4"),
  icon("target", "Target", ["target", "goal", "focus", "aim", "precision"], `${circle(12, 12, 9)} ${circle(12, 12, 5.5)} ${circle(12, 12, 2)}`),
  icon("trophy", "Trophy", ["trophy", "award", "winner", "achievement", "best"], "M8 4 h8 v5 a4 4 0 0 1 -8 0z M8 6 H5 a3 3 0 0 0 3 4 M16 6 h3 a3 3 0 0 1 -3 4 M12 13 v4 M9 21 h6 M10 17 h4 v4 h-4z"),
  icon("lightbulb", "Light bulb", ["idea", "lightbulb", "insight", "tip", "creative"], "M9 18 h6 M10 21 h4 M12 3 a6 6 0 0 0 -3.5 10.9 c0.6 0.5 1 1.2 1 2 V16 h5 v-0.1 c0 -0.8 0.4 -1.5 1 -2 A6 6 0 0 0 12 3z"),
  icon("megaphone", "Megaphone", ["megaphone", "announce", "marketing", "launch", "news", "promo"], "M3 10 v4 a1 1 0 0 0 1 1 h3 l9 5 V4 L7 9 H4 a1 1 0 0 0 -1 1z M7 15 l1.5 5 h2.5 l-1 -4.5 M19 9 a3 3 0 0 1 0 6"),
  icon("camera", "Camera", ["camera", "photo", "capture", "snapshot"], `M4 7 h3 l2 -3 h6 l2 3 h3 a1 1 0 0 1 1 1 v11 a1 1 0 0 1 -1 1 h-16 a1 1 0 0 1 -1 -1 v-11 a1 1 0 0 1 1 -1z ${circle(12, 13, 4)}`),
  icon("mic", "Microphone", ["mic", "microphone", "voice", "podcast", "audio", "record"], "M9 5 a3 3 0 0 1 6 0 v6 a3 3 0 0 1 -6 0z M5 11 a7 7 0 0 0 14 0 M12 18 v3 M9 21 h6"),
  icon("music", "Music note", ["music", "audio", "sound", "song", "beat"], `M9 18 V5 l11 -2 v13 ${circle(6, 18, 3)} ${circle(17, 16, 3)}`),
  icon("image", "Image", ["image", "photo", "picture", "gallery", "media"], `M5 3 h14 a2 2 0 0 1 2 2 v14 a2 2 0 0 1 -2 2 h-14 a2 2 0 0 1 -2 -2 v-14 a2 2 0 0 1 2 -2z ${circle(8.5, 8.5, 1.5)} M21 15 l-5 -5 L5 21`),
  icon("palette", "Palette", ["palette", "color", "design", "brand", "theme", "creative"], "M12 3 a9 9 0 0 0 0 18 c1.1 0 1.7 -0.9 1.4 -1.9 c-0.4 -1.2 0.5 -2.1 1.6 -2.1 H17 a4 4 0 0 0 4 -4 C21 7 17 3 12 3z", `${dot(7.5, 11)}${dot(10, 7)}${dot(14.5, 7)}${dot(17, 10.5)}`),
  icon("cursor-click", "Cursor click", ["click", "cursor", "interact", "select", "ui"], "M9 9 L20 13 L15.5 15.5 L13 20Z M5 3.5 l1.5 2.5 M3 8 l2.8 0.4 M10 3 l-0.5 2.8"),
  icon("link", "Link", ["link", "url", "chain", "connect", "integration"], "M10 14 a4.5 4.5 0 0 0 6.4 0 l3 -3 a4.5 4.5 0 0 0 -6.4 -6.4 l-1.2 1.2 M14 10 a4.5 4.5 0 0 0 -6.4 0 l-3 3 a4.5 4.5 0 0 0 6.4 6.4 l1.2 -1.2"),
  icon("gift", "Gift", ["gift", "reward", "bonus", "free", "offer", "present"], "M4 10 h16 v11 h-16z M3 7 h18 v3 h-18z M12 7 v14 M12 7 C10 3 6 3.5 7 6 C7.5 7 12 7 12 7 C12 7 16.5 7 17 6 C18 3.5 14 3 12 7"),
  icon("dollar", "Dollar", ["dollar", "money", "price", "revenue", "pricing", "currency"], `${circle(12, 12, 9)} M15 9 c-0.5 -1.2 -1.8 -2 -3 -2 c-1.7 0 -3 1 -3 2.5 S10.3 12 12 12 s3 1 3 2.5 S13.7 17 12 17 c-1.3 0 -2.5 -0.8 -3 -2 M12 5.5 V7 M12 17 v1.5`),
  icon("cart", "Shopping cart", ["cart", "shop", "ecommerce", "buy", "checkout"], `M3 4 h2.5 l2.2 11 h10.3 l2 -8 H6.5 ${circle(9, 19.5, 1.5)} ${circle(17, 19.5, 1.5)}`),
  icon("map-pin", "Map pin", ["location", "map", "pin", "place", "local"], `M12 21 C8 16.5 5 13 5 9.5 a7 7 0 0 1 14 0 C19 13 16 16.5 12 21Z ${circle(12, 9.5, 2.5)}`),
  icon("eye", "Eye", ["eye", "view", "visibility", "watch", "preview"], `M2 12 C4.5 7 8 5 12 5 s7.5 2 10 7 c-2.5 5 -6 7 -10 7 S4.5 17 2 12Z ${circle(12, 12, 3)}`),
  icon("flame", "Flame", ["flame", "fire", "hot", "trending", "streak", "popular"], "M12 22 c-4 0 -7 -2.8 -7 -6.8 C5 11 9 9 9.5 4 C12.5 6 13 8.5 12.5 10.5 C14 10 15 8.6 15.2 7.5 C17.7 9.6 19 12.4 19 15.2 C19 19.2 16 22 12 22Z"),
  icon("thumbs-up", "Thumbs up", ["thumbs up", "like", "approve", "good", "feedback"], "M7 10 v11 H4 a1 1 0 0 1 -1 -1 v-9 a1 1 0 0 1 1 -1z M7 10 l4 -7 a2 2 0 0 1 2.5 2 L13 9 h6 a2 2 0 0 1 2 2.3 l-1.3 7.5 A2.5 2.5 0 0 1 17.2 21 H7"),
  icon("send", "Send", ["send", "paper plane", "submit", "share", "deliver"], "M21 3 L10 14 M21 3 L14.5 21 L10 14 L3 9.5Z"),
  icon("brush", "Brush", ["brush", "paint", "design", "art", "creative", "edit"], "M18.5 3 a2 2 0 0 1 2.8 2.8 L12 15 l-3 -3z M9 12 c-3 0 -5 2 -5 4.5 c0 1.5 -0.7 2.6 -2 3.5 c4.5 1 9 -0.5 10 -5"),
  icon("scissors", "Scissors", ["scissors", "cut", "trim", "edit", "clip"], `${circle(6, 6, 3)} ${circle(6, 18, 3)} M8.5 7.8 L20 18 M8.5 16.2 L20 6`),
  icon("type", "Type", ["type", "text", "font", "typography", "caption"], "M5 6 V4 h14 v2 M12 4 v16 M9 20 h6"),
  icon("grid", "Layout grid", ["grid", "layout", "templates", "dashboard", "apps"], "M4 4 h7 v7 h-7z M13 4 h7 v7 h-7z M4 13 h7 v7 h-7z M13 13 h7 v7 h-7z"),
  icon("refresh", "Refresh", ["refresh", "sync", "update", "loop", "repeat", "regenerate"], "M20 11 a8 8 0 0 0 -14.5 -4.5 L4 8 M4 4 v4 h4 M4 13 a8 8 0 0 0 14.5 4.5 L20 16 M20 20 v-4 h-4"),
];
