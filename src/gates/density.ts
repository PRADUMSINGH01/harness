// Text-beat economics: on-screen words per second, longest text block, smallest type.
import type { Finding, GateResult, Genre } from "../types.ts";
import type { Project } from "../project.ts";
// Caption text lives in JS data, not DOM, so it does not count here.
export const id = "density";
export const needsBrowser = false;

import { durationOf } from "../project.ts";

const BLOCK_TAGS = /<\/?(div|p|h[1-6]|li|ul|ol|section|article|header|footer|figure|figcaption|td|th|tr|button|br|blockquote|main|nav|aside|label)\b[^>]*>/gi;

export function textBlocks(html) {
  const body = (html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html)
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<template\b[\s\S]*?<\/template>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  return body
    .replace(BLOCK_TAGS, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&[a-z]+;|&#\d+;/gi, "x")
    .split(/\n/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s && /[A-Za-z0-9]/.test(s));
}

const words = (s) => s.split(/\s+/).filter(Boolean).length;

export function run(project: Project, genre?: Genre): GateResult {
  const rules = genre.density ?? {};
  const findings: Finding[] = [];
  const blocks = project.files.flatMap((f) => textBlocks(f.html).map((text) => ({ text, file: f.rel })));
  const totalWords = blocks.reduce((a, b) => a + words(b.text), 0);
  const duration = durationOf(project);
  const wps = duration ? totalWords / duration : null;

  if (wps != null && rules.maxWordsPerSecond && wps > rules.maxWordsPerSecond) {
    findings.push({
      gate: id,
      severity: "warning",
      code: "text-heavy",
      message: `${totalWords} on-screen words over ${duration}s = ${wps.toFixed(2)} words/s (genre cap ${rules.maxWordsPerSecond}).`,
      fix: "Cut words, not seconds: one idea per beat, let visuals carry proof (text-beat economics).",
    });
  }
  for (const b of blocks) {
    const n = words(b.text);
    if (rules.maxWordsPerBlock && n > rules.maxWordsPerBlock) {
      findings.push({
        gate: id,
        severity: "warning",
        code: "long-block",
        message: `${n}-word text block: "${b.text.slice(0, 80)}${b.text.length > 80 ? "…" : ""}"`,
        fix: `Keep on-screen blocks ≤ ${rules.maxWordsPerBlock} words; move detail to VO or cut it.`,
        file: b.file,
      });
    }
  }

  // Smallest authored font size, scaled to a 1080px short edge.
  const shortEdge = Math.min(project.canvas.width, project.canvas.height);
  const minPx = (rules.minFontPx ?? 28) * (shortEdge / 1080);
  const small = new Map();
  for (const f of project.files) {
    for (const m of f.html.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)px/gi)) {
      const px = Number(m[1]);
      if (px > 0 && px < minPx) small.set(`${f.rel}:${px}`, { file: f.rel, px });
    }
  }
  for (const s of small.values()) {
    findings.push({
      gate: id,
      severity: "warning",
      code: "small-type",
      message: `font-size ${s.px}px is below the ${Math.round(minPx)}px floor for a ${shortEdge}px short edge — unreadable on a phone.`,
      fix: "Raise it, or drop the text if it is decoration.",
      file: s.file,
    });
  }
  return { status: "ran", findings, data: { totalWords, duration, wordsPerSecond: wps && Math.round(wps * 100) / 100, blocks: blocks.length } };
}
