import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

// True when `target` is `root` or inside it. Checks isAbsolute too: on Windows a path on another
// drive comes back from relative() as an absolute path, not a "../" one.
export function isInside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function readJson(path, fallback = undefined) {
  if (!existsSync(path)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`missing ${path}`);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

export function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

export function writeText(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

export function walk(dir: string, { skip = [], ext }: { skip?: string[]; ext?: string[] } = {}): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (skip.includes(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p, { skip, ext }));
    else if (!ext || ext.some((e) => name.toLowerCase().endsWith(e))) out.push(p);
  }
  return out;
}

// Minimal YAML frontmatter: flat `key: value` lines, which is all BRIEF.md / STORYBOARD.md use at top level.
export function parseFrontmatter(text: string | null): { data: Record<string, string>; body: string } {
  if (!text || !text.startsWith("---")) return { data: {}, body: text || "" };
  const end = text.indexOf("\n---", 3);
  if (end === -1) return { data: {}, body: text };
  const data: Record<string, string> = {};
  for (const line of text.slice(3, end).split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (m) data[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return { data, body: text.slice(end + 4).replace(/^\r?\n/, "") };
}

// "45s" | "1:30" | "45" | "30-45s" | "~60s" -> seconds or [min, max]
export function parseSeconds(value: unknown): number | [number, number] | null {
  if (value == null || value === "") return null;
  const s = String(value).trim().replace(/^~/, "");
  const range = s.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*s?$/i);
  if (range) return [Number(range[1]), Number(range[2])];
  const mmss = s.match(/^(\d+):(\d{1,2})$/);
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2]);
  const n = s.match(/^(\d+(?:\.\d+)?)\s*(s|sec|secs|seconds)?$/i);
  if (n) return Number(n[1]);
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(m|min|mins|minutes)$/i);
  if (m) return Number(m[1]) * 60;
  return null;
}

export function lineAt(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

// Deterministic PRNG so variant seeding is reproducible from the run name.
export function rng(seedText) {
  let h = 2166136261;
  for (const ch of String(seedText)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

export const round = (x, d = 1) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);
