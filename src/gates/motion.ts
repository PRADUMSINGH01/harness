// Motion-doctrine Part 2, statically: idle wobble, forbidden eases, slow single entries,
// over-long staggers. `hyperframes check` passes all of these, so the harness owns them.
import type { Finding, GateResult, Genre } from "../types.ts";
import { type Project, type ProjectFile, inlineScripts, stripComments, styleBlocks } from "../project.ts";
import { lineAt } from "../util.ts";

export const id = "motion";
export const needsBrowser = false;

// `tl.to(`, `gsap.from(`, and chained `).to(` all count.
const TWEEN = /(?:\b([A-Za-z_$][\w$]*)|\))\s*\.\s*(to|from|fromTo)\s*\(/g;
const IDLE_NAMES = /breath|float|pulse|bob|drift|glow|wobble|sway|hover|idle/i;
const NOT_TWEEN_OWNERS = new Set(["Math", "console", "Object", "JSON", "Array", "window", "document", "Promise", "Number", "String"]);

export interface Tween {
  method: string;
  args: string;
  line: number;
  repeat: number | null;
  yoyo: boolean;
  ease: string | null;
  duration: number | null;
  stagger: number | null;
  staggerAmount: number | null;
  fromHidden: boolean;
}

// Return the argument text of a call whose "(" sits at `open`.
export function callArgs(code: string, open: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < code.length; i++) {
    const c = code[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") {
      depth--;
      if (depth === 0) return code.slice(open + 1, i);
    }
  }
  return code.slice(open + 1);
}

function numberOption(args: string, key: string): number | null {
  const m = args.match(new RegExp(`\\b${key}\\s*:\\s*(-?\\d*\\.?\\d+)`));
  return m ? Number(m[1]) : null;
}

function stringOption(args: string, key: string): string | null {
  return args.match(new RegExp(`\\b${key}\\s*:\\s*["'\`]([^"'\`]+)["'\`]`))?.[1] ?? null;
}

export function scanTweens(file: ProjectFile): Tween[] {
  const tweens: Tween[] = [];
  for (const block of inlineScripts(file.html)) {
    const code = stripComments(block.code);
    for (const m of code.matchAll(TWEEN)) {
      if (m[1] && NOT_TWEEN_OWNERS.has(m[1])) continue;
      const args = callArgs(code, m.index! + m[0].length - 1);
      const fromVars = args.split("},")[0] ?? "";
      tweens.push({
        method: m[2],
        args,
        line: lineAt(file.html, block.offset + m.index!),
        repeat: numberOption(args, "repeat"),
        yoyo: /\byoyo\s*:\s*true/.test(args),
        ease: stringOption(args, "ease"),
        duration: numberOption(args, "duration"),
        stagger: numberOption(args, "stagger") ?? numberOption(args, "each"),
        staggerAmount: numberOption(args, "amount"),
        fromHidden: /\b(opacity|autoAlpha)\s*:\s*0(\.0+)?\b/.test(fromVars),
      });
    }
  }
  return tweens;
}

export function run(project: Project, genre: Genre): GateResult {
  const rules = genre.motion ?? {};
  const maxEntry = rules.maxSingleEntrySec ?? 1.0;
  const maxStagger = rules.maxStaggerEachSec ?? 0.2;
  const maxStaggerAmount = rules.maxStaggerTotalSec ?? 0.6;
  const maxEases = rules.maxDistinctEases ?? 6;
  const findings: Finding[] = [];
  const add = (f: Omit<Finding, "gate">, file: ProjectFile, line?: number) => findings.push({ gate: id, file: file.rel, line, ...f });
  let tweenCount = 0;
  let cssAnimations = 0;
  const easeUse = new Map<string, number>();

  for (const file of project.files) {
    for (const t of scanTweens(file)) {
      tweenCount++;
      if (t.ease) easeUse.set(t.ease, (easeUse.get(t.ease) ?? 0) + 1);
      const loops = t.repeat != null && (t.repeat < 0 || t.repeat >= 1);
      if (loops && (t.yoyo || /sine/i.test(t.ease ?? ""))) {
        add(
          {
            severity: "error",
            code: "idle-wobble",
            message: `Looping ${t.yoyo ? "yoyo " : ""}tween (repeat: ${t.repeat}${t.ease ? `, ease: ${t.ease}` : ""}): breathe/float/pulse filler. Motion must perform, not wait.`,
            fix: "Replace with a sustained-motion route: staged reveal, camera with intent, sequenced UI life, animated sequence, or cursor-led action (motion-doctrine Part 2).",
          },
          file,
          t.line,
        );
      } else if (t.repeat != null && t.repeat < 0) {
        add(
          {
            severity: "warning",
            code: "infinite-loop",
            message: "Infinite repeat without yoyo: acceptable only for a ticker/marquee that carries information.",
            fix: "Give it a finite count tied to a beat, or confirm it is a content-carrying ticker.",
          },
          file,
          t.line,
        );
      }
      if (/bounce|elastic/i.test(t.ease ?? "")) {
        add(
          {
            severity: "error",
            code: "forbidden-ease",
            message: `Ease "${t.ease}" is forbidden by motion-doctrine.`,
            fix: "Use power2/power3/power4 or expo, with back.out(1.4-1.7) for a deliberate entry overshoot.",
          },
          file,
          t.line,
        );
      }
      if ((t.method === "from" || t.method === "fromTo") && t.fromHidden && t.duration != null && t.duration > maxEntry) {
        add(
          {
            severity: "warning",
            code: "slow-entry",
            message: `Single entry runs ${t.duration}s (doctrine: about 0.8s max; a longer buildup is a multi-element stagger).`,
            fix: "Shorten the entry, or split it into a staggered cascade (cut-the-curve §6 waterfall).",
          },
          file,
          t.line,
        );
      }
      if (t.stagger != null && t.stagger > maxStagger) {
        add({ severity: "warning", code: "slow-stagger", message: `Per-item stagger ${t.stagger}s > ${maxStagger}s.`, fix: "Tighten per-item delay; keep total stagger under 0.5s." }, file, t.line);
      }
      if (t.staggerAmount != null && t.staggerAmount > maxStaggerAmount) {
        add({ severity: "warning", code: "slow-stagger", message: `Total stagger ${t.staggerAmount}s > ${maxStaggerAmount}s.`, fix: "Keep total stagger under 0.5s." }, file, t.line);
      }
    }

    for (const block of styleBlocks(file.html)) {
      for (const m of block.code.matchAll(/animation\s*:\s*([^;}"]+)/gi)) {
        cssAnimations++;
        const decl = m[1].trim();
        if (!/infinite/i.test(decl)) continue;
        const line = lineAt(file.html, block.offset + m.index!);
        if (IDLE_NAMES.test(decl)) {
          add({ severity: "error", code: "idle-wobble", message: `CSS idle loop: animation: ${decl}`, fix: "Remove the idle loop; give the phase a sustained-motion route." }, file, line);
        } else {
          add({ severity: "warning", code: "infinite-loop", message: `CSS infinite animation: ${decl}`, fix: "Confirm it carries information, or make it finite and beat-tied." }, file, line);
        }
      }
    }
  }

  // Doctrine: similar elements share one ease intent. A long tail of distinct eases reads as noise.
  const distinctEases = [...easeUse.keys()].filter((e) => e !== "none");
  if (distinctEases.length > maxEases) {
    findings.push({
      gate: id,
      severity: "warning",
      code: "ease-sprawl",
      message: `${distinctEases.length} distinct eases (${distinctEases.join(", ")}). Similar elements should share one ease+duration intent.`,
      fix: `Consolidate to ${maxEases} or fewer eases with clear roles (entry, exit, camera, overshoot).`,
    });
  }
  if (tweenCount === 0 && cssAnimations === 0 && project.files.length) {
    findings.push({
      gate: id,
      severity: "warning",
      code: "no-motion",
      message: "No GSAP tweens or CSS animations found.",
      fix: "Author the motion on the paused timeline registered in window.__timelines.",
    });
  }
  return { status: "ran", findings, data: { tweenCount, cssAnimations, distinctEases } };
}
