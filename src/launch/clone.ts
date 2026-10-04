// Clone the landing page's real components as code. Chrome renders the live site (its JS runs only
// here), then each component (header, hero, feature cards, sections, closing CTA) is copied as HTML
// with every element's final computed style written inline, headings split into animatable words,
// SVG icons kept inline, and images and fonts downloaded so the film renders offline. The trailer
// animates these live elements, so it looks exactly like the site and stays sharp at any zoom.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { chromePath } from "../hf.ts";

export interface ClonedPart {
  name: string; // header, hero, features, section-1, cta
  html: string; // self-contained markup (inline styles; asset urls point at clone/…)
  w: number; // rendered size in CSS px at the capture viewport
  h: number;
  title?: string;
  // Animatable handles inside the markup (data-hf attributes): words, cards, icons, buttons.
  handles: string[];
  // The background the part sits on in the page (its own or the nearest ancestor's), as CSS declarations.
  ground?: string;
  // Share of the part's area covered by images (0 = all code, 1 = all pictures).
  imageShare?: number;
}

export interface CloneKit {
  url: string;
  viewport: { w: number; h: number };
  // font: the headline family; body: the full font stack the site's copy is set in.
  theme: { bg: string; ink: string; muted: string; accent: string; dark: boolean; font: string; body?: string };
  fontCss: string; // @font-face rules for the families the parts use, pointing at local files
  parts: ClonedPart[];
  version: number;
}

const VERSION = 20;
const VIEW = { w: 1440, h: 900 };
const KIT_FILE = "clone.json";

export async function ensureClone(captureDir: string, url: string): Promise<CloneKit | null> {
  const cached = join(captureDir, KIT_FILE);
  if (existsSync(cached)) {
    try {
      const kit = JSON.parse(readFileSync(cached, "utf8")) as CloneKit;
      if (kit.version === VERSION && kit.url === url) return kit;
    } catch {}
  }
  const kit = await cloneSite(url, captureDir);
  if (kit) writeFileSync(cached, JSON.stringify(kit));
  return kit;
}

interface PageClone {
  theme: CloneKit["theme"];
  parts: (Omit<ClonedPart, "html"> & { html: string })[];
  urls: string[];
  fonts: { family: string; weight: string; style: string; src: string; unicodeRange?: string }[];
  usedFamilies: string[];
  rasters: { id: string; x: number; y: number; w: number; h: number }[];
  debug?: unknown;
}

export async function cloneSite(url: string, captureDir: string): Promise<CloneKit | null> {
  const executablePath = await chromePath();
  if (!executablePath) return null;
  const { default: puppeteer } = await import("puppeteer-core");
  const browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox", "--hide-scrollbars", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  // Font files arrive as responses; keep their bytes so @font-face can point at local copies.
  const fontBytes = new Map<string, Buffer>();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: VIEW.w, height: VIEW.h, deviceScaleFactor: 1 });
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36");
    page.on("response", async (res) => {
      try {
        if (res.request().resourceType() === "font" && res.ok()) fontBytes.set(res.url(), Buffer.from(await res.buffer()));
      } catch {}
    });
    const t0 = Date.now();
    try {
      await page.goto(url, { waitUntil: "load", timeout: 30_000 });
    } catch {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    }
    await page.waitForNetworkIdle({ idleTime: 600, timeout: 6000 }).catch(() => {});
    if (process.env.HF_CLONE_DEBUG) console.log(`clone goto: ${Date.now() - t0}ms`);
    const stamp = (() => {
      let t = Date.now();
      return (label: string) => {
        if (process.env.HF_CLONE_DEBUG) console.log(`clone ${label}: ${Date.now() - t}ms`);
        t = Date.now();
      };
    })();
    stamp("load");
    await page.evaluate("globalThis.__name = (fn) => fn");
    // Walk the page so lazy content loads and scroll reveals settle in their final state.
    await page.evaluate(async () => {
      const step = Math.round(innerHeight * 0.6);
      for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
        scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      scrollTo(0, 0);
    });
    await new Promise((r) => setTimeout(r, 1500));
    await page.evaluate(() => document.fonts.ready);
    stamp("walk");
    const cloned = (await page.evaluate(cloneInPage)) as PageClone;
    stamp("parts");
    if (process.env.HF_CLONE_DEBUG) console.log(JSON.stringify(cloned.debug));
    const assetDirEarly = join(captureDir, "clone");
    mkdirSync(assetDirEarly, { recursive: true });
    const rasterFiles = new Map<string, string>();
    for (const r of cloned.rasters.filter((r) => r.w > 40 && r.h > 40).slice(0, 6)) {
      try {
        await page.evaluate((y) => scrollTo(0, Math.max(0, y - 100)), r.y);
        await new Promise((res) => setTimeout(res, 600));
        const file = `clone/${r.id}.png`;
        await page.screenshot({ path: join(captureDir, file) as `${string}.png`, clip: { x: r.x, y: r.y, width: r.w, height: r.h }, captureBeyondViewport: true });
        rasterFiles.set(r.id, file);
      } catch {}
    }

    stamp("rasters");
    // Localize every image the parts reference.
    const assetDir = join(captureDir, "clone");
    mkdirSync(assetDir, { recursive: true });
    const local = new Map<string, string>();
    await Promise.all(
      cloned.urls.map(async (u) => {
        try {
          if (u.startsWith("data:")) return;
          const res = await fetch(u, { signal: AbortSignal.timeout(15_000), headers: { "user-agent": "Mozilla/5.0" } });
          if (!res.ok) return;
          const type = (res.headers.get("content-type") ?? "").split(";")[0];
          const ext = ({ "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/svg+xml": ".svg", "image/gif": ".gif", "image/avif": ".avif" } as Record<string, string>)[type] ?? (extname(new URL(u).pathname) || ".bin");
          const name = `${createHash("sha1").update(u).digest("hex").slice(0, 12)}${ext}`;
          writeFileSync(join(assetDir, name), Buffer.from(await res.arrayBuffer()));
          local.set(u, `clone/${name}`);
        } catch {}
      }),
    );
    stamp("images");
    // Fonts: only the families the parts use, from the bytes Chrome already downloaded.
    const used = new Set(cloned.usedFamilies.map((f) => f.toLowerCase()));
    const faces: string[] = [];
    for (const f of cloned.fonts) {
      if (!used.has(f.family.toLowerCase())) continue;
      const bytes = fontBytes.get(f.src);
      if (!bytes) continue;
      const name = `${createHash("sha1").update(f.src).digest("hex").slice(0, 12)}${extname(new URL(f.src).pathname) || ".woff2"}`;
      writeFileSync(join(assetDir, name), bytes);
      faces.push(`@font-face { font-family: '${f.family}'; src: url('clone/${name}'); font-weight: ${f.weight}; font-style: ${f.style}; font-display: block;${f.unicodeRange ? ` unicode-range: ${f.unicodeRange};` : ""} }`);
    }
    // The body stack keeps only families the trailer can load, plus the CSS generic ones.
    const loaded = new Set(cloned.fonts.filter((f) => fontBytes.has(f.src)).map((f) => f.family.toLowerCase()));
    const GENERIC = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-sans-serif", "ui-serif", "ui-monospace", "ui-rounded"]);
    const body = (cloned.theme.body ?? "")
      .split(",")
      .map((f) => f.trim().replace(/["']/g, ""))
      .filter((f) => used.has(f.toLowerCase()) && loaded.has(f.toLowerCase()) || GENERIC.has(f.toLowerCase()));
    if (!body.some((f) => GENERIC.has(f.toLowerCase()))) body.push("sans-serif");
    const swap = (html: string) =>
      html.replace(/url\(&quot;(.*?)&quot;\)/g, "url('$1')").replace(/__HFURL__\[([^\]]+)\]/g, (_m, u) => local.get(decodeURIComponent(u)) ?? "").replace(/__HFRASTER__\[([^\]]+)\]/g, (_m, id) => rasterFiles.get(id) ?? "");
    return {
      url,
      viewport: VIEW,
      theme: { ...cloned.theme, body: body.map((f) => (GENERIC.has(f.toLowerCase()) ? f : `'${f}'`)).join(", ") },
      fontCss: faces.join("\n"),
      parts: cloned.parts.map((p) => ({ ...p, html: swap(p.html), ground: p.ground ? swap(p.ground) : undefined })),
      version: VERSION,
    };
  } catch {
    return null;
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------------------------------------
// Runs in the page. Self-contained: no references to module scope.
async function cloneInPage(): Promise<PageClone> {
  const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
  const urls = new Set<string>();
  const families = new Set<string>();
  const mark = (u: string) => {
    const abs = new URL(u, location.href).href;
    urls.add(abs);
    return `__HFURL__[${encodeURIComponent(abs)}]`;
  };

  // The style properties that make up a component's look. Layout boxes are frozen to their rendered
  // size so text wraps exactly as on the site.
  const PROPS = [
    "display", "box-sizing", "position", "top", "right", "bottom", "left", "z-index", "overflow", "overflow-x", "overflow-y",
    "flex-direction", "flex-wrap", "justify-content", "align-items", "align-content", "align-self", "justify-self", "justify-items", "order",
    "flex-grow", "flex-shrink", "flex-basis", "gap", "row-gap", "column-gap",
    "grid-template-columns", "grid-template-rows", "grid-template-areas", "grid-column", "grid-row", "grid-auto-flow", "grid-auto-rows", "grid-auto-columns", "grid-area",
    "margin-top", "margin-right", "margin-bottom", "margin-left", "padding-top", "padding-right", "padding-bottom", "padding-left",
    "font-family", "font-size", "font-weight", "font-style", "font-feature-settings", "font-variation-settings", "line-height", "letter-spacing", "word-spacing", "text-align", "text-transform", "text-decoration-line", "text-decoration-color", "text-shadow", "white-space", "text-wrap", "text-overflow", "vertical-align",
    "color", "background-color", "background-image", "background-size", "background-position", "background-repeat", "background-clip", "-webkit-background-clip", "-webkit-text-fill-color",
    "border-top-width", "border-right-width", "border-bottom-width", "border-left-width", "border-top-style", "border-right-style", "border-bottom-style", "border-left-style",
    "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
    "border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius",
    "box-shadow", "opacity", "filter", "backdrop-filter", "-webkit-backdrop-filter", "mix-blend-mode", "transform", "transform-origin",
    "object-fit", "object-position", "aspect-ratio", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "mask-image", "-webkit-mask-image", "clip-path", "list-style-type", "cursor",
  ];
  const DEFAULTS: Record<string, string> = {
    position: "static", top: "auto", right: "auto", bottom: "auto", left: "auto", "z-index": "auto", overflow: "visible", "overflow-x": "visible", "overflow-y": "visible",
    "flex-direction": "row", "flex-wrap": "nowrap", "justify-content": "normal", "align-items": "normal", "align-content": "normal", "align-self": "auto", "justify-self": "auto", "justify-items": "normal", order: "0",
    "flex-grow": "0", "flex-shrink": "1", "flex-basis": "auto", gap: "normal", "row-gap": "normal", "column-gap": "normal",
    "grid-template-columns": "none", "grid-template-rows": "none", "grid-template-areas": "none", "grid-column": "auto", "grid-row": "auto", "grid-auto-flow": "row", "grid-auto-rows": "auto", "grid-auto-columns": "auto", "grid-area": "auto",
    "margin-top": "0px", "margin-right": "0px", "margin-bottom": "0px", "margin-left": "0px", "padding-top": "0px", "padding-right": "0px", "padding-bottom": "0px", "padding-left": "0px",
    "font-style": "normal", "font-feature-settings": "normal", "font-variation-settings": "normal", "letter-spacing": "normal", "word-spacing": "0px", "text-transform": "none", "text-decoration-line": "none", "text-shadow": "none", "white-space": "normal", "text-wrap": "wrap", "text-overflow": "clip", "vertical-align": "baseline",
    "background-color": "rgba(0, 0, 0, 0)", "background-image": "none", "background-size": "auto", "background-position": "0% 0%", "background-repeat": "repeat", "background-clip": "border-box", "-webkit-background-clip": "border-box",
    "border-top-width": "0px", "border-right-width": "0px", "border-bottom-width": "0px", "border-left-width": "0px", "border-top-style": "none", "border-right-style": "none", "border-bottom-style": "none", "border-left-style": "none",
    "border-top-left-radius": "0px", "border-top-right-radius": "0px", "border-bottom-right-radius": "0px", "border-bottom-left-radius": "0px",
    "box-shadow": "none", opacity: "1", filter: "none", "backdrop-filter": "none", "-webkit-backdrop-filter": "none", "mix-blend-mode": "normal", transform: "none",
    "object-fit": "fill", "object-position": "50% 50%", "aspect-ratio": "auto", "stroke-width": "1px", "stroke-linecap": "butt", "stroke-linejoin": "miter", "mask-image": "none", "-webkit-mask-image": "none", "clip-path": "none", cursor: "auto",
  };
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "IFRAME", "OBJECT", "EMBED", "LINK", "META"]);

  const styleOf = (el: Element, root: boolean, rect: DOMRect): string => {
    const cs = getComputedStyle(el);
    const out: string[] = [];
    for (const p of PROPS) {
      let v = cs.getPropertyValue(p);
      const side = p.match(/^border-(top|right|bottom|left)-width$/)?.[1];
      if (side && cs.getPropertyValue(`border-${side}-style`) !== "none") {
        out.push(`${p}:${v}`);
        continue;
      }
      if (side && v === "0px") continue;
      if (!v || v === DEFAULTS[p]) continue;
      if ((p === "border-top-color" || p === "border-right-color" || p === "border-bottom-color" || p === "border-left-color") && cs.getPropertyValue(p.replace("color", "style")) === "none") continue;
      if (p === "background-image" || p === "mask-image" || p === "-webkit-mask-image") v = v.replace(/url\("?([^")]+)"?\)/g, (_m, u) => `url("${mark(u)}")`);
      if (p === "font-family") v.split(",").forEach((f) => families.add(f.trim().replace(/["']/g, "")));
      if (p === "position" && (v === "fixed" || v === "sticky")) v = "relative";
      if (p === "cursor") continue;
      out.push(`${p}:${v.replace(/"/g, "'")}`);
    }
    // Freeze the box: text wraps and grids lay out exactly as rendered.
    if (cs.display !== "inline" && !(el instanceof SVGElement && !(el instanceof SVGSVGElement))) {
      out.push(`width:${rect.width}px`);
      if (el instanceof SVGSVGElement || el.tagName === "IMG" || el.tagName === "VIDEO" || el.tagName === "CANVAS" || root) out.push(`height:${rect.height}px`);
    }
    if (cs.display === "inline" && /^(IMG|VIDEO|CANVAS|INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) out.push("display:inline-block", `width:${rect.width}px`, `height:${rect.height}px`);
    if (root) out.push("margin:0", "position:relative", "left:auto", "top:auto");
    return out.join(";");
  };

  const handles: string[] = [];
  const rasters: { id: string; x: number; y: number; w: number; h: number }[] = [];
  const clipText = (cs: CSSStyleDeclaration) => (cs.getPropertyValue("-webkit-background-clip") === "text" || cs.getPropertyValue("background-clip") === "text") && cs.backgroundImage !== "none";
  // A hidden element stacked on a visible sibling is a state (ticker, slide, cross-fade), not a reveal.
  const stacked = (el: Element) => {
    const r = el.getBoundingClientRect();
    return [...(el.parentElement?.children ?? [])].some((sib) => {
      if (sib === el || parseFloat(getComputedStyle(sib).opacity) < 0.05) return false;
      const sr = sib.getBoundingClientRect();
      const ix = Math.min(r.right, sr.right) - Math.max(r.left, sr.left);
      const iy = Math.min(r.bottom, sr.bottom) - Math.max(r.top, sr.top);
      return ix > 0 && iy > 0 && ix * iy > 0.3 * Math.min(r.width * r.height, sr.width * sr.height);
    });
  };
  const unrevealed = (el: Element, cs: CSSStyleDeclaration) =>
    parseFloat(cs.opacity) < 0.05 && (cs.position === "static" || cs.position === "relative") && (el instanceof HTMLImageElement || clean((el as HTMLElement).innerText).length > 0) && !stacked(el);
  const reveal = (node: HTMLElement | SVGElement, el: Element, cs: CSSStyleDeclaration) => {
    if (!unrevealed(el, cs)) return;
    node.style.opacity = "1";
    node.style.transform = "none";
  };
  const cloneNode = (el: Element, root: boolean, inHeading = false, gradient?: string): Node | null => {
    if (SKIP_TAGS.has(el.tagName)) return null;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return null;
    const rect = el.getBoundingClientRect();
    if (!(el instanceof SVGElement) && rect.width === 0 && rect.height === 0 && el.children.length === 0) return null;

    if (el instanceof SVGSVGElement) {
      // Icons stay vector: keep the markup, resolve CSS-driven paint into attributes.
      const svg = el.cloneNode(true) as SVGSVGElement;
      const orig = [el, ...el.querySelectorAll("*")];
      const copy = [svg, ...svg.querySelectorAll("*")];
      orig.forEach((o, i) => {
        const c = copy[i] as Element;
        const s = getComputedStyle(o);
        for (const a of ["class", "style", "id"]) c.removeAttribute(a);
        if (o instanceof SVGGraphicsElement || o === el) {
          if (s.fill && s.fill !== "none") c.setAttribute("fill", s.fill.startsWith("url") ? "currentColor" : s.fill);
          else if (s.fill === "none") c.setAttribute("fill", "none");
          if (s.stroke && s.stroke !== "none") c.setAttribute("stroke", s.stroke.startsWith("url") ? "currentColor" : s.stroke);
          if (s.strokeWidth && s.strokeWidth !== "1px") c.setAttribute("stroke-width", s.strokeWidth);
          if (s.opacity !== "1") c.setAttribute("opacity", s.opacity);
        }
      });
      svg.querySelectorAll("script, foreignObject").forEach((n) => n.remove());
      for (const a of ["width", "height"]) if (svg.hasAttribute(a) && !/^\d+(\.\d+)?(px|em|%)?$/.test(svg.getAttribute(a)!.trim())) svg.removeAttribute(a);
      svg.setAttribute("style", `${styleOf(el, root, rect)};color:${cs.color}`);
      svg.setAttribute("data-hf", "icon");
      return svg;
    }

    const out = document.createElement(/^(A|BUTTON|INPUT|TEXTAREA|SELECT|IMG|VIDEO|CANVAS|PICTURE)$/.test(el.tagName) ? "span" : el.tagName.toLowerCase());
    out.setAttribute("style", styleOf(el, root, rect));
    reveal(out, el, cs);

    if (el instanceof HTMLImageElement) {
      const img = document.createElement("img");
      img.setAttribute("src", mark(el.currentSrc || el.src));
      img.setAttribute("alt", el.alt || "");
      img.setAttribute("style", styleOf(el, root, rect));
      reveal(img, el, cs);
      return img;
    }
    if (el instanceof HTMLVideoElement) {
      if (el.poster) out.style.backgroundImage = `url("${mark(el.poster)}")`;
      out.style.backgroundSize = "cover";
      return out;
    }
    if (el instanceof HTMLCanvasElement || (el.tagName === "DIV" && el.querySelector(":scope > canvas") && !el.querySelector(":scope > :not(canvas)"))) {
      // A WebGL/2D scene has no markup to clone: the trailer shows the site's own rendered pixels here.
      const id = `raster-${rasters.length + 1}`;
      rasters.push({ id, x: rect.left + scrollX, y: rect.top + scrollY, w: rect.width, h: rect.height });
      out.style.backgroundImage = `url("__HFRASTER__[${id}]")`;
      out.style.backgroundSize = "100% 100%";
      out.innerHTML = "";
      return out;
    }
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      out.textContent = el.value || el.placeholder || "";
      return out;
    }
    // Buttons and links that look like buttons are animation handles (cursor targets).
    if ((el.tagName === "A" || el.tagName === "BUTTON") && (cs.backgroundColor !== "rgba(0, 0, 0, 0)" || cs.borderTopStyle !== "none") && rect.width > 60) {
      out.setAttribute("data-hf", "button");
      handles.push("button");
    }
    const heading = /^H[1-3]$/.test(el.tagName);
    if (heading) out.setAttribute("data-hf", el.tagName.toLowerCase());
    if (!heading && !inHeading && el.children.length === 0 && parseFloat(cs.fontSize) >= 20) {
      const m = clean(el.textContent).match(/^([$€£₹¥]?)(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?(%|x|×|k|K|M|B|h|ms|s)?(\+?)$/);
      if (m) {
        const num = m[2].replace(/,/g, "");
        out.setAttribute("data-hf", "stat");
        out.setAttribute("data-to", num);
        out.setAttribute("data-dec", String((num.split(".")[1] ?? "").length));
        out.setAttribute("data-prefix", m[1]);
        out.setAttribute("data-suffix", `${m[3] ?? ""}${m[4] ?? ""}`);
        if (m[2].includes(",")) out.setAttribute("data-sep", "1");
        handles.push("stat");
      }
    }
    const splitting = heading || inHeading;
    const myGradient = clipText(cs) ? cs.backgroundImage : gradient;
    // The words carry the gradient now; an ancestor still clipping to text would swallow their paint.
    if (splitting && clipText(cs)) out.setAttribute("style", `${out.getAttribute("style")};background-image:none;-webkit-background-clip:border-box;background-clip:border-box;-webkit-text-fill-color:currentColor`);

    // Pseudo-elements carry real decoration (gradients, dots, icons): materialize them.
    for (const which of ["::before", "::after"] as const) {
      const ps = getComputedStyle(el, which);
      if (!ps.content || ps.content === "none" || ps.content === "normal" || ps.display === "none") continue;
      const span = document.createElement("span");
      const txt = ps.content.replace(/^["']|["']$/g, "");
      if (txt && !/^url\(/.test(ps.content)) span.textContent = txt;
      const keep = ["display", "position", "top", "right", "bottom", "left", "width", "height", "background-color", "background-image", "background-size", "background-position", "border-radius", "opacity", "transform", "filter", "content", "color", "font-size", "z-index", "inset", "margin-left", "margin-right"];
      span.setAttribute("style", keep.filter((k) => k !== "content").map((k) => `${k}:${ps.getPropertyValue(k).replace(/url\("?([^")]+)"?\)/g, (_m, u) => `url('${mark(u)}')`)}`).join(";"));
      if (which === "::before") out.appendChild(span);
      else out.setAttribute("data-after", "1"), (out as any).__after = span;
    }

    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent ?? "";
        if (!text.trim()) {
          if (text.length) out.appendChild(document.createTextNode(" "));
          continue;
        }
        if (splitting) {
          // Words become masked handles: <span data-hf="w"><span>word</span></span>.
          text.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) return out.appendChild(document.createTextNode(" "));
            const w = document.createElement("span");
            w.setAttribute("data-hf", "w");
            // A zero line-height (common on gradient spans) would collapse an inline-block mask to nothing.
            const tight = parseFloat(cs.lineHeight) < parseFloat(cs.fontSize) * 0.6 ? ";line-height:1.1" : "";
            w.setAttribute("style", `display:inline-block;overflow:hidden;vertical-align:bottom;padding-bottom:0.08em${tight}`);
            const inner = document.createElement("span");
            inner.setAttribute("style", (tight ? "line-height:1.1;" : "") + (myGradient ? `display:inline-block;background-image:${myGradient};-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent` : "display:inline-block"));
            inner.textContent = part;
            w.appendChild(inner);
            out.appendChild(w);
          });
        } else out.appendChild(document.createTextNode(text));
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const c = cloneNode(child as Element, false, splitting, myGradient);
        if (c) out.appendChild(c);
      }
    }
    if ((out as any).__after) out.appendChild((out as any).__after);
    return out;
  };

  const pageBase = (): string => {
    for (const e of [document.body, document.documentElement, document.querySelector("main"), document.body.firstElementChild]) {
      if (!e) continue;
      const c = getComputedStyle(e).backgroundColor;
      if (c !== "rgba(0, 0, 0, 0)" && !/,\s*0(\.0+)?\)$/.test(c)) return c;
    }
    return /dark/.test(getComputedStyle(document.documentElement).colorScheme) ? "rgb(0, 0, 0)" : "rgb(255, 255, 255)";
  };
  // The ground behind an element, as the page paints it: walk the layers under its center (overlay
  // gradients, a full-bleed hero image, a section color) until an opaque one, and stack them as CSS
  // backgrounds. Hero text often sits on a positioned <picture>, not on an ancestor's background.
  const groundOf = (el: Element): string | undefined => {
    const r = el.getBoundingClientRect();
    const layers: string[] = [];
    let color = "";
    const cx = r.left + r.width / 2;
    const cy = r.top + Math.min(r.height / 2, 40);
    if (cy > 0 && cy < innerHeight && cx > 0 && cx < innerWidth) {
      for (const e of document.elementsFromPoint(cx, cy)) {
        if (e === el || el.contains(e) || e.contains(el)) {
          // Ancestors still count when they paint something themselves.
          if (!e.contains(el) || e === el) continue;
        }
        const c = getComputedStyle(e);
        if (c.visibility === "hidden" || parseFloat(c.opacity) < 0.05) continue;
        const er = e.getBoundingClientRect();
        const decorative = parseFloat(c.opacity) < 0.95 || c.filter !== "none" || c.mixBlendMode !== "normal" || er.width < innerWidth * 0.6 || clipText(c);
        if (decorative && !(e instanceof HTMLImageElement && er.width >= innerWidth * 0.6)) continue;
        if (e instanceof HTMLImageElement && (e.currentSrc || e.src)) {
          layers.push(`url('${mark(e.currentSrc || e.src)}') ${c.objectPosition} / cover no-repeat`);
          break;
        }
        if (e instanceof HTMLVideoElement && e.poster) {
          layers.push(`url('${mark(e.poster)}') center / cover no-repeat`);
          break;
        }
        if (c.backgroundImage !== "none") layers.push(c.backgroundImage.replace(/url\("?([^")]+)"?\)/g, (_m, u) => `url('${mark(u)}')`).replace(/"/g, "'"));
        const transparent = c.backgroundColor === "rgba(0, 0, 0, 0)" || /,\s*0(\.0+)?\)$/.test(c.backgroundColor);
        if (!transparent) {
          const alpha = parseFloat(c.backgroundColor.match(/rgba?\([^)]*,\s*([\d.]+)\)/)?.[1] ?? "1");
          if (alpha >= 0.95) {
            color = c.backgroundColor;
            break;
          }
          layers.push(`linear-gradient(${c.backgroundColor}, ${c.backgroundColor})`);
        }
      }
    }
    if (!layers.length && !color) {
      for (let e: Element | null = el; e; e = e.parentElement) {
        const c = getComputedStyle(e);
        if (clipText(c)) continue;
        if (c.backgroundImage !== "none") layers.push(c.backgroundImage.replace(/url\("?([^")]+)"?\)/g, (_m, u) => `url('${mark(u)}')`).replace(/"/g, "'"));
        if (c.backgroundColor !== "rgba(0, 0, 0, 0)" && !/,\s*0(\.0+)?\)$/.test(c.backgroundColor)) {
          color = c.backgroundColor;
          break;
        }
      }
    }
    if (!color) color = pageBase();
    if (!layers.length && !color) return undefined;
    return `background:${[...layers, color || "transparent"].join(", ")}`;
  };
  const imageShare = (el: Element): number => {
    const r = el.getBoundingClientRect();
    const area = Math.max(1, r.width * r.height);
    let covered = 0;
    for (const m of el.querySelectorAll("img, video, canvas, picture")) {
      const mr = m.getBoundingClientRect();
      covered += Math.max(0, Math.min(mr.right, r.right) - Math.max(mr.left, r.left)) * Math.max(0, Math.min(mr.bottom, r.bottom) - Math.max(mr.top, r.top));
    }
    return Math.min(1, Math.round((covered / area) * 100) / 100);
  };
  const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
  const frames = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res(null))));
  const look = (el: Element) => {
    let sig = "";
    const all = [el, ...el.querySelectorAll("*")];
    for (let i = 0; i < all.length && i < 400; i++) {
      const c = getComputedStyle(all[i]);
      sig += `${c.opacity}${c.transform}|`;
    }
    return sig;
  };
  // Bring the element into view and let its reveal play out: no finite animation running on it or
  // inside it, and its opacity/transform unchanged between two looks (JS-driven reveals too). Capped.
  const timing: Record<string, number> = {};
  const settle = async (el: Element) => {
    const r = el.getBoundingClientRect();
    const moved = r.top < 0 || r.bottom > innerHeight;
    if (moved) {
      el.scrollIntoView({ block: r.height > innerHeight ? "start" : "center" });
      await frames();
      await sleep(300);
    }
    const end = performance.now() + (moved ? 3200 : 1200);
    let last = look(el);
    while (performance.now() < end) {
      await sleep(160);
      const busy = document.getAnimations().some((a) => {
        const t = (a.effect as KeyframeEffect | null)?.target;
        return a.playState === "running" && !!t && (el.contains(t) || t.contains(el)) && Number.isFinite(Number(a.effect?.getComputedTiming().endTime));
      });
      const now = look(el);
      const hidden = moved && [el, ...el.querySelectorAll("*")].some((e) => unrevealed(e, getComputedStyle(e)));
      if (!busy && !hidden && now === last) break;
      last = now;
    }
  };
  // The width of the element's widest line of text (title pieces are cropped to it).
  const textWidth = (el: Element) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0);
    if (!rects.length) return 0;
    return Math.max(...rects.map((r) => r.right)) - Math.min(...rects.map((r) => r.left));
  };
  const part = async (name: string, el: Element | null | undefined, title?: string, tight = false) => {
    if (!el) return null;
    const t0 = performance.now();
    await settle(el);
    timing[name] = Math.round(performance.now() - t0);
    handles.length = 0;
    const rect = el.getBoundingClientRect();
    const node = cloneNode(el, true) as HTMLElement | null;
    if (!node) return null;
    node.setAttribute("data-hf-part", name);
    let w = Math.round(rect.width);
    const tw = tight ? Math.ceil(textWidth(el)) + 4 : 0;
    if (tw > 40 && tw < w * 0.85) {
      for (const e of [node, ...node.querySelectorAll<HTMLElement>("*")]) {
        if (e.getAttribute("data-hf") === "w" || e.parentElement?.getAttribute("data-hf") === "w") continue;
        const ew = parseFloat(e.style.width);
        if (e === node || ew > tw) {
          e.style.width = `${tw}px`;
          e.style.marginLeft = "0px";
          e.style.marginRight = "0px";
          e.style.paddingLeft = "0px";
          e.style.paddingRight = "0px";
        }
      }
      w = tw;
    }
    return { name, html: node.outerHTML, w, h: Math.round(rect.height), title, handles: [...new Set(handles)], ground: groundOf(el), imageShare: imageShare(el) };
  };

  // ---- pick the components ------------------------------------------------------------
  const PRICE = /([$€£₹¥]\s?\d[\d,]*(?:\.\d+)?|\bfree\b)/i;
  const h1 = document.querySelector("h1");
  const header = (() => {
    const h = document.querySelector("header") ?? document.querySelector("nav");
    if (!h || h.getBoundingClientRect().height <= 200) return h;
    return [...h.querySelectorAll("*")].find((e) => { const r = e.getBoundingClientRect(); return r.top + scrollY < 20 && r.height >= 36 && r.height <= 160 && r.width > innerWidth * 0.7; }) ?? h;
  })();
  // Hero: the h1's ancestor that also holds its supporting paragraph and buttons, but not the header.
  let hero: Element | null = h1;
  for (let i = 0; i < 6 && hero?.parentElement; i++) {
    const up = hero.parentElement;
    if (header && up.contains(header)) break;
    if (up.getBoundingClientRect().height > innerHeight * 1.4) break;
    hero = up;
    if (hero.querySelector("p") && hero.querySelector("a, button") && hero.getBoundingClientRect().width > innerWidth * 0.4) break;
  }
  // Feature cards group.
  const headingOf = (el: Element) => el.querySelector("h2, h3, h4, h5");
  let features: { parent: Element; items: Element[] } | null = null;
  let bestScore = 0;
  for (const parent of document.querySelectorAll("section, div, ul")) {
    const kids = [...parent.children].filter((k) => {
      const r = k.getBoundingClientRect();
      return headingOf(k) && k.querySelectorAll("h1, h2, h3, h4, h5").length <= 1 && clean((k as HTMLElement).innerText).length <= 400 && !PRICE.test((k as HTMLElement).innerText) && r.width > 160 && r.height > 60 && r.height < 900;
    });
    if (kids.length < 3 || kids.length > 8 || kids.length < parent.children.length * 0.5 || parent.closest("footer, header, nav")) continue;
    const score = kids.length + 2 * kids.filter((k) => k.querySelector("svg, img")).length;
    if (score > bestScore) (bestScore = score), (features = { parent, items: kids });
  }
  // Content sections with a heading and visuals, below the hero, not the footer.
  const heroBottom = hero ? hero.getBoundingClientRect().bottom + scrollY : innerHeight;
  const sections = [...document.querySelectorAll("section")]
    .filter((s) => {
      const r = s.getBoundingClientRect();
      return r.top + scrollY >= heroBottom - 10 && r.height > 280 && r.height < 1300 && r.width > innerWidth * 0.5 && !s.closest("footer") && s.querySelector("h2, h3") && (!features || !s.contains(features.parent) || s === features.parent);
    })
    .filter((s, i, all) => !all.some((o, j) => j !== i && o.contains(s)))
    .map((s, order) => ({ s, order, pics: imageShare(s) }))
    .sort((a, b) => a.pics - b.pics || a.order - b.order)
    .slice(0, 4)
    .sort((a, b) => a.order - b.order)
    .map((x) => x.s);
  // Closing CTA: the last section before the footer that holds a heading and a button.
  const ctaSection = [...document.querySelectorAll("section, div")]
    .filter((s) => {
      const r = s.getBoundingClientRect();
      return r.top + scrollY > document.documentElement.scrollHeight * 0.55 && r.height > 160 && r.height < 700 && s.querySelector("h2, h3") && s.querySelector("a, button") && !s.closest("footer") && clean((s as HTMLElement).innerText).length < 400;
    })
    .pop();

  // Theme: the ground behind the page, the ink of the headline, the muted ink of its paragraph, and
  // the accent from the primary button's fill.
  const opaque = (c: string) => !/rgba\([^)]*,\s*0\)$/.test(c) && c !== "transparent";
  const toHex = (c: string) => {
    const m = c.match(/\d+(\.\d+)?/g);
    return m ? `#${m.slice(0, 3).map((n) => Math.round(Number(n)).toString(16).padStart(2, "0")).join("")}` : "#000000";
  };
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ground = toHex([document.body, document.documentElement, document.querySelector("main")].filter(Boolean).map((e) => getComputedStyle(e as Element).backgroundColor).find(opaque) ?? "rgb(255,255,255)");
  const ink = toHex(getComputedStyle(h1 ?? document.body).color);
  const para = hero?.querySelector("p");
  const muted = toHex(getComputedStyle(para ?? h1 ?? document.body).color);
  const button = [...(hero ?? document).querySelectorAll<HTMLElement>("a, button")].find((b) => opaque(getComputedStyle(b).backgroundColor) && b.getBoundingClientRect().width > 60);
  const fill = button ? toHex(getComputedStyle(button).backgroundColor) : ink;
  const accent = Math.abs(lum(fill) - lum(ground)) > 0.2 ? fill : ink;

  // The logo: the first visible mark in the header (hidden mobile copies have no box).
  const logoEl = (() => {
    if (!header) return null;
    const marks = [...header.querySelectorAll("svg, img")].filter((m) => { const r = m.getBoundingClientRect(); return r.width > 20 && r.height > 8 && getComputedStyle(m).visibility !== "hidden"; });
    const mark = marks[0];
    if (!mark) return null;
    // Prefer the home link around it when that link is just the mark (wordmark plus symbol together).
    const link = mark.closest("a");
    return link && link.getBoundingClientRect().width < 320 && link.getBoundingClientRect().width >= mark.getBoundingClientRect().width ? link : mark;
  })();
  const subEl = hero ? [...hero.querySelectorAll("p")].find((p) => clean(p.textContent).split(" ").length >= 5) : null;
  // The primary button: a filled one (color or gradient), else the first one that reads like a CTA.
  // Candidates: links and buttons on the first screen, outside the header (the hero area, wherever its container ends).
  const heroLinks = [...document.querySelectorAll<HTMLElement>("a, button")].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 60 && r.height > 20 && r.top + scrollY < innerHeight * 1.1 && !(header && header.contains(b)) && getComputedStyle(b).visibility !== "hidden"; });
  const filled = (b: HTMLElement) => { const c = getComputedStyle(b); return c.backgroundColor !== "rgba(0, 0, 0, 0)" || c.backgroundImage !== "none"; };
  // A real call to action beats a filled badge ("Join us at …" pills are announcements, not CTAs).
  // Strip leading glyphs (zero-width spaces, icon characters) before reading the label.
  const ctaText = (b: HTMLElement) => /^(get|start|try|book|sign|create|open|build|launch|request|contact|download|deploy)\b/i.test(clean(b.innerText).replace(/^[^\p{L}\p{N}]+/u, ""));
  const primary = heroLinks.find((b) => ctaText(b) && filled(b)) ?? heroLinks.find(ctaText) ?? heroLinks.find(filled) ?? null;
  const buttonsEl = primary ? (primary.parentElement && primary.parentElement.querySelectorAll("a, button").length <= 4 && primary.parentElement !== hero ? primary.parentElement : primary) : null;
  // A section's title block: its heading grown to the smallest wrapper that still holds no media.
  const titleOf = (sec: Element): Element | null => {
    const h = sec.querySelector("h2, h3");
    if (!h) return null;
    const sr = sec.getBoundingClientRect();
    let t: Element = h;
    while (t.parentElement && t.parentElement !== sec) {
      const up = t.parentElement;
      const r = up.getBoundingClientRect();
      if (up.querySelector("img, video, canvas, picture") || clean((up as HTMLElement).innerText).length > 420 || r.width * r.height > sr.width * sr.height * 0.45) break;
      t = up;
    }
    return t;
  };
  // A section's hero visual: the largest card-like or media-rich block that isn't its title.
  const visualOf = (sec: Element, title: Element | null): Element | null => {
    const sr = sec.getBoundingClientRect();
    const area = sr.width * sr.height;
    let best: Element | null = null;
    let bestScore = 0;
    for (const e of sec.querySelectorAll("div, figure, ul, ol, article, picture, img")) {
      if (title && (e.contains(title) || title.contains(e))) continue;
      const r = e.getBoundingClientRect();
      const a = r.width * r.height;
      if (a < area * 0.1 || a > area * 0.8 || r.width < 240 || r.height < 140) continue;
      const c = getComputedStyle(e);
      const card = c.backgroundColor !== "rgba(0, 0, 0, 0)" || c.boxShadow !== "none" || c.borderTopStyle !== "none" || c.backgroundImage !== "none" ? 1 : 0;
      const media = e.querySelectorAll("img, svg, canvas, video").length + (e.matches("img, picture") ? 2 : 0);
      const text = clean((e as HTMLElement).innerText).length;
      const score = (a / area) * (1 + card * 1.5 + Math.min(media, 6) * 0.3) * (text > 1500 ? 0.5 : 1);
      if (score > bestScore) (bestScore = score), (best = e);
    }
    return best;
  };
  // Customer logos: a row of 5+ small marks with almost no text.
  let logosEl: Element | null = null;
  for (const parent of document.querySelectorAll("div, ul, section")) {
    const kids = [...parent.children];
    if (kids.length < 5 || kids.length > 40 || parent.closest("header, nav, footer")) continue;
    const marks = kids.filter((k) => {
      const m = k.matches("img, svg") ? k : k.querySelector("img, svg");
      const r = k.getBoundingClientRect();
      return m && r.height > 12 && r.height < 110 && clean((k as HTMLElement).innerText ?? "").length < 24;
    });
    const r = parent.getBoundingClientRect();
    if (marks.length >= 5 && marks.length >= kids.length * 0.7 && r.width > innerWidth * 0.4 && r.height < 300) {
      logosEl = parent;
      break;
    }
  }
  const logosLabel = logosEl?.parentElement ? [...logosEl.parentElement.querySelectorAll("p, h2, h3, h4, span")].find((e) => !logosEl!.contains(e) && clean(e.textContent).length > 4 && clean(e.textContent).length < 80 && !!(e.compareDocumentPosition(logosEl!) & Node.DOCUMENT_POSITION_FOLLOWING)) : undefined;
  // Pricing: 2-5 sibling cards that each show a price.
  let pricingEl: Element | null = null;
  let pricingCount = 0;
  for (const parent of document.querySelectorAll("section, div, ul")) {
    const kids = [...parent.children].filter((k) => { const r = k.getBoundingClientRect(); return PRICE.test((k as HTMLElement).innerText ?? "") && clean((k as HTMLElement).innerText).length < 1500 && r.width > 180 && r.height > 200; });
    if (kids.length >= 2 && kids.length <= 5 && kids.length >= parent.children.length * 0.6 && kids.length > pricingCount) (pricingCount = kids.length), (pricingEl = parent);
  }
  // Pick every piece first (picking reads the page at rest), then clone them top to bottom, each in view.
  const jobs: [string, Element | null | undefined, string | undefined, boolean?][] = [
    ["logo", logoEl, undefined],
    ["headline", h1, undefined],
    ["subline", subEl, undefined],
    ["buttons", buttonsEl, undefined],
    ["header", header, undefined],
    ["hero", hero, undefined],
  ];
  if (features) jobs.push(["features", features.parent, clean(features.parent.parentElement?.querySelector("h2")?.textContent ?? "") || undefined]);
  sections.forEach((s, i) => {
    const title = clean(s.querySelector("h2, h3")?.textContent ?? "").slice(0, 80);
    const t = titleOf(s);
    jobs.push([`section-${i + 1}`, s, title], [`section-${i + 1}-title`, t, title, true], [`section-${i + 1}-visual`, visualOf(s, t), title]);
  });
  jobs.push(
    ["cta", ctaSection, clean(ctaSection?.querySelector("h2, h3")?.textContent ?? "")],
    ["logos", logosEl, logosLabel ? clean(logosLabel.textContent) : undefined],
    ["pricing", pricingEl, clean(pricingEl?.closest("section")?.querySelector("h2, h3")?.textContent ?? "") || undefined],
  );
  const top = (e: Element | null | undefined) => (e ? e.getBoundingClientRect().top + scrollY : 0);
  const order = jobs.map((j, i) => ({ j, i, y: i < 6 ? -1 : top(j[1]) })).sort((a, b) => a.y - b.y || a.i - b.i);
  const done = new Map<number, PageClone["parts"][number] | null>();
  for (const { j, i } of order) done.set(i, await part(j[0], j[1], j[2], j[3]));
  const parts = jobs.map((_, i) => done.get(i)).filter(Boolean) as PageClone["parts"];
  scrollTo(0, 0);

  // @font-face sources the page declared (same-origin sheets are readable; others are skipped).
  const fonts: PageClone["fonts"] = [];
  for (const sheet of [...document.styleSheets]) {
    let rules: CSSRuleList | null = null;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const r of [...rules]) {
      if (!(r instanceof CSSFontFaceRule)) continue;
      const fam = r.style.getPropertyValue("font-family").replace(/["']/g, "").trim();
      const src = r.style.getPropertyValue("src").match(/url\("?([^")]+)"?\)/)?.[1];
      if (!fam || !src) continue;
      fonts.push({ family: fam, weight: r.style.getPropertyValue("font-weight") || "400", style: r.style.getPropertyValue("font-style") || "normal", src: new URL(src, sheet.href ?? location.href).href, unicodeRange: r.style.getPropertyValue("unicode-range") || undefined });
    }
  }

  return {
    theme: { bg: ground, ink, muted, accent, dark: lum(ground) < 0.45, font: clean(getComputedStyle(h1 ?? document.body).fontFamily.split(",")[0].replace(/["']/g, "")), body: getComputedStyle(subEl ?? document.body).fontFamily.replace(/"/g, "'") },
    parts,
    urls: [...urls],
    fonts,
    usedFamilies: [...families],
    rasters,
    debug: { links: heroLinks.map((b) => clean(b.innerText).slice(0, 30) + "@" + Math.round(b.getBoundingClientRect().top + scrollY)), primary: primary ? clean(primary.innerText) : null, timing },
  } as PageClone;
}
