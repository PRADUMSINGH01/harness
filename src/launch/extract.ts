// Site parts: the landing page's real building blocks (navbar, hero, feature cards with their own
// icons, pricing plans), read from the captured DOM in Chrome with scripts off. Launch scenes rebuild
// these as live, animatable elements instead of showing a flat screenshot.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromePath } from "../hf.ts";

export interface SiteFeature {
  title: string;
  text: string;
  icon?: string; // sanitized inline <svg> markup, drawn in currentColor
}

export interface SitePlan {
  name: string;
  price: string; // as written: "$29", "Free", "₹999"
  amount?: number; // numeric part, for counting up
  period?: string;
  features: string[];
  featured: boolean;
}

export interface SiteParts {
  nav: string[];
  headerCta?: string;
  hero: { headline: string; subline?: string; ctas: string[] };
  features: SiteFeature[];
  plans: SitePlan[];
  version: number;
}

const PARTS_FILE = "site-parts.json";
const PARTS_VERSION = 2;

export async function ensureSiteParts(captureDir: string): Promise<SiteParts> {
  const cached = join(captureDir, PARTS_FILE);
  if (existsSync(cached)) {
    try {
      const parts = JSON.parse(readFileSync(cached, "utf8")) as SiteParts;
      if (parts.version === PARTS_VERSION) return parts;
    } catch {}
  }
  const parts = await extractSiteParts(join(captureDir, "extracted", "page.html"));
  writeFileSync(cached, JSON.stringify(parts, null, 2));
  return parts;
}

export async function extractSiteParts(pageHtml: string): Promise<SiteParts> {
  const empty: SiteParts = { nav: [], hero: { headline: "", ctas: [] }, features: [], plans: [], version: PARTS_VERSION };
  if (!existsSync(pageHtml)) return empty;
  const executablePath = await chromePath();
  if (!executablePath) return empty;
  const { default: puppeteer } = await import("puppeteer-core");
  const browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-gpu"] });
  try {
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    // The capture is a snapshot; nothing it links to is needed to read its structure.
    await page.setRequestInterception(true);
    page.on("request", (r) => (r.url().startsWith("file:") || r.url().startsWith("data:") ? r.continue() : r.abort()));
    // setContent from a UTF-8 read: a saved page without a charset meta would otherwise decode as Latin-1.
    await page.setContent(readFileSync(pageHtml, "utf8"), { waitUntil: "domcontentloaded", timeout: 30_000 });
    // tsx/esbuild wraps named functions in __name(); define it in the page before passing one in.
    await page.evaluate("globalThis.__name = (fn) => fn");
    const parts = (await page.evaluate(readParts)) as Omit<SiteParts, "version">;
    return { ...parts, version: PARTS_VERSION };
  } finally {
    await browser.close();
  }
}

// Runs inside the page. Self-contained: no closures over module scope.
function readParts() {
  const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
  const words = (s: string) => clean(s).split(" ").filter(Boolean).length;
  // Animated headlines often ship a hidden duplicate: "X X" reads as "X".
  // Any number of copies: the shortest word sequence that repeats to the end.
  const dedupe = (s: string) => {
    const w = s.split(" ");
    for (let k = 1; k <= w.length / 2; k++) {
      if (w.every((x, i) => x === w[i % k])) return w.slice(0, k).join(" ");
    }
    return s;
  };
  // Text with a space at every element boundary: without the site CSS, spans styled as separate
  // lines ("Intake" / "and integrations") would otherwise run together.
  const spaced = (el: Node): string =>
    el.nodeType === 3 ? (el.textContent ?? "") : el.nodeName === "BR" ? " " : [...el.childNodes].map((c) => (c.nodeType === 1 && /^(SPAN|DIV|P|LI|H\d)$/.test(c.nodeName) ? ` ${spaced(c)} ` : spaced(c))).join("");
  const visibleText = (el: Element) => clean(spaced(el)).replace(/\s+([,.!?])/g, "$1");

  // Inline icon: keep only geometry, draw it in currentColor, size it with CSS.
  const iconOf = (root: Element): string | undefined => {
    const svg = root.querySelector("svg");
    if (!svg) return undefined;
    const vb = svg.getAttribute("viewBox") ?? (svg.getAttribute("width") && svg.getAttribute("height") ? `0 0 ${parseFloat(svg.getAttribute("width")!)} ${parseFloat(svg.getAttribute("height")!)}` : null);
    if (!vb) return undefined;
    const copy = svg.cloneNode(true) as SVGElement;
    copy.querySelectorAll("script, foreignObject, style, image, text").forEach((n) => n.remove());
    const shapes = copy.querySelectorAll("path, circle, rect, line, polyline, polygon, ellipse");
    if (!shapes.length || copy.outerHTML.length > 12_000) return undefined;
    const walk = (el: Element) => {
      for (const a of [...el.attributes]) {
        const n = a.name.toLowerCase();
        if (n.startsWith("on") || n === "class" || n === "style" || n === "id" || n.startsWith("data-") || n === "width" || n === "height" || n === "aria-hidden" || n === "focusable" || n === "role") el.removeAttribute(a.name);
        else if ((n === "fill" || n === "stroke") && a.value !== "none" && !/^url\(/.test(a.value)) el.setAttribute(a.name, "currentColor");
        else if (/^url\(/.test(a.value)) el.setAttribute(a.name, "currentColor");
      }
      [...el.children].forEach(walk);
    };
    walk(copy);
    copy.setAttribute("viewBox", vb);
    copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    if (!copy.getAttribute("fill") && !copy.querySelector("[fill]") && !copy.querySelector("[stroke]")) copy.setAttribute("fill", "currentColor");
    return copy.outerHTML;
  };

  // Navbar: short link labels in the header, minus auth/utility links.
  const header = document.querySelector("header") ?? document.querySelector("nav");
  const navLinks = header ? [...header.querySelectorAll("a, button")].map(visibleText).filter((t) => t && words(t) <= 3 && t.length <= 24) : [];
  const auth = /^(log ?in|sign ?in|sign ?up|get started|start free|try|book a demo|contact sales|download|open app|start creating)/i;
  // Accessibility-only controls (menu toggles, skip links) are not navigation.
  const utility = /menu|toggle|close|skip to|search|open main|language|theme/i;
  const nav = [...new Set(navLinks.filter((t) => !auth.test(t) && !utility.test(t)))].slice(0, 6);
  const headerCta = navLinks.reverse().find((t) => auth.test(t) && !/log ?in|sign ?in/i.test(t));

  // Hero: the first h1, the paragraph right after it, and the buttons beside it.
  const h1 = document.querySelector("h1");
  let heroBox: Element | null = h1;
  for (let i = 0; i < 4 && heroBox?.parentElement; i++) {
    heroBox = heroBox.parentElement;
    if (heroBox.querySelector("p") && heroBox.querySelector("a, button")) break;
  }
  const subline = heroBox ? [...heroBox.querySelectorAll("p")].map(visibleText).find((t) => words(t) >= 4 && t.length <= 220) : undefined;
  const ctas = heroBox ? [...new Set([...heroBox.querySelectorAll("a, button")].map(visibleText).filter((t) => t && words(t) <= 4 && t.length <= 28 && t !== visibleText(h1!)))].slice(0, 2) : [];

  // Features: the best group of 3-6 sibling cards that each carry one short heading and a line of text.
  const PRICE = /([$€£₹¥]\s?\d[\d,]*(?:\.\d+)?|\bfree\b)/i;
  const headingOf = (el: Element) => el.querySelector("h2, h3, h4, h5, strong");
  let best: { score: number; items: { title: string; text: string; icon?: string }[] } = { score: 0, items: [] };
  for (const parent of document.querySelectorAll("section, div, ul")) {
    // A card has exactly one heading and little text; a section has several headings and paragraphs.
    const kids = [...parent.children].filter((k) => headingOf(k) && k.querySelectorAll("h1, h2, h3, h4, h5").length <= 1 && visibleText(k).length <= 360 && !PRICE.test(visibleText(k)));
    if (kids.length < 3 || kids.length > 8 || kids.length < parent.children.length * 0.5) continue;
    const items = kids
      .map((k) => {
        const h = headingOf(k)!;
        const title = visibleText(h);
        const text = [...k.querySelectorAll("p")].map(visibleText).find((t) => t && t !== title && words(t) >= 3) ?? "";
        return { title, text, icon: iconOf(k) };
      })
      .filter((it) => it.title && words(it.title) <= 7 && !/[$€£₹]\s?\d/.test(it.title));
    if (items.length < 3) continue;
    const score = items.length + items.filter((i) => i.text).length + 2 * items.filter((i) => i.icon).length + (parent.closest("footer") ? -20 : 0) + (parent.closest("header, nav") ? -20 : 0);
    if (score > best.score) best = { score, items };
  }

  // Pricing: sibling cards that each show one price.
  let plans: { name: string; price: string; amount?: number; period?: string; features: string[]; featured: boolean }[] = [];
  for (const parent of document.querySelectorAll("section, div, ul")) {
    const kids = [...parent.children].filter((k) => PRICE.test(visibleText(k)) && visibleText(k).length < 1200);
    if (kids.length < 2 || kids.length > 5 || kids.length < parent.children.length * 0.6) continue;
    const found = kids
      .map((k) => {
        const text = visibleText(k);
        const price = clean(text.match(PRICE)?.[1]);
        const name = visibleText(headingOf(k) ?? k).split(" ").slice(0, 3).join(" ");
        const period = text.match(/\/\s?(mo|month|yr|year|user\/month|seat\/month)\b|per (month|year|user)/i)?.[0];
        const features = [...k.querySelectorAll("li")].map(visibleText).filter((t) => t && words(t) <= 8).slice(0, 4);
        const amount = Number(price.replace(/[^\d.]/g, ""));
        return { name, price, amount: /free/i.test(price) ? 0 : Number.isFinite(amount) ? amount : undefined, period: period ? clean(period) : undefined, features, featured: /popular|recommended|best value|most/i.test(text.slice(0, 160)) || /featured|popular|highlight/i.test((k as HTMLElement).className?.toString() ?? "") };
      })
      .filter((p) => p.name && p.price && words(p.name) <= 3);
    if (found.length >= 2 && found.length > plans.length) plans = found;
  }

  // No card grid: the page's own section headings are its feature list.
  if (best.items.length < 3) {
    const sections = [...document.querySelectorAll("h2")]
      .filter((h) => !h.closest("footer, header, nav") && words(visibleText(h)) <= 6 && !/changelog|faq|pricing|blog|customers|testimonial|future|today/i.test(visibleText(h)))
      .map((h) => {
        let box: Element | null = h.parentElement;
        let text = "";
        for (let i = 0; i < 3 && box && !text; i++, box = box.parentElement) text = [...box.querySelectorAll("p")].map(visibleText).find((t) => words(t) >= 4 && words(t) <= 30) ?? "";
        return { title: visibleText(h), text, icon: undefined as string | undefined };
      });
    const seen = new Set<string>();
    const unique = sections.filter((f) => !seen.has(f.title) && !!seen.add(f.title));
    if (unique.length >= 3) best = { score: 1, items: unique };
  }

  return {
    nav,
    headerCta,
    hero: { headline: dedupe(visibleText(h1 ?? document.body)).slice(0, 120), subline, ctas: ctas.map(dedupe) },
    features: best.items.slice(0, 6),
    plans: plans.slice(0, 4),
  };
}
