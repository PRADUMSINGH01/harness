// Render determinism: every frame must be a pure function of seek time.
import type { Finding, GateResult, Genre } from "../types.ts";
import type { Project } from "../project.ts";
import { inlineScripts, stripComments } from "../project.ts";
import { lineAt } from "../util.ts";

export const id = "determinism";
export const needsBrowser = false;

const RULES = [
  { re: /\bMath\.random\s*\(/g, severity: "error", code: "unseeded-random", message: "Math.random() — differs per render worker and per seek.", fix: "Use a seeded PRNG (mulberry32/sfc32) with a constant seed." },
  { re: /\bDate\.now\s*\(|\bnew\s+Date\s*\(\s*\)/g, severity: "error", code: "wall-clock", message: "Wall-clock time read at render.", fix: "Derive from the timeline's time, never the clock." },
  { re: /\bperformance\.now\s*\(/g, severity: "error", code: "wall-clock", message: "performance.now() at render.", fix: "Derive from the timeline's time." },
  { re: /\bfetch\s*\(|\bXMLHttpRequest\b|\bnew\s+WebSocket\b|\bimport\s*\(/g, severity: "error", code: "render-network", message: "Network or dynamic import at render time.", fix: "Stage the data/asset into the project and inline or reference it locally." },
  { re: /\bsetInterval\s*\(|\brequestAnimationFrame\s*\(/g, severity: "warning", code: "time-driven", message: "Time-driven loop — not seekable; scrubbing and parallel workers will disagree.", fix: "Move the motion onto the paused timeline." },
  { re: /\bsetTimeout\s*\(/g, severity: "warning", code: "time-driven", message: "setTimeout schedules by wall clock, not by seek.", fix: "Place the event on the timeline (tl.call / tl.set at a position)." },
];

export function run(project: Project, genre?: Genre): GateResult {
  const findings: Finding[] = [];
  for (const file of project.files) {
    for (const block of inlineScripts(file.html)) {
      const code = stripComments(block.code);
      const seeded = /mulberry|sfc32|xorshift|seedrandom|splitmix/i.test(code);
      for (const rule of RULES) {
        for (const m of code.matchAll(rule.re)) {
          const severity = (rule.code === "unseeded-random" && seeded ? "warning" : rule.severity) as Finding["severity"];
          findings.push({ gate: id, severity, code: rule.code, message: rule.message, fix: rule.fix, file: file.rel, line: lineAt(file.html, block.offset + m.index) });
        }
      }
    }
    if (!/window\.__timelines\s*\[/.test(file.html) && !/__timelines/.test(file.html)) {
      findings.push({ gate: id, severity: "warning", code: "no-timeline", message: "Composition registers no timeline on window.__timelines.", fix: "Register one paused timeline: window.__timelines[\"<id>\"] = tl.", file: file.rel });
    }
  }
  return { status: "ran", findings };
}
