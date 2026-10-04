// Duration against the genre band and the brief's confirmed `length`.
import type { Finding, GateResult, Genre } from "../types.ts";
import type { Project } from "../project.ts";
import { durationOf } from "../project.ts";
import { parseSeconds } from "../util.ts";

export const id = "duration";
export const needsBrowser = false;

export function run(project: Project, genre?: Genre): GateResult {
  const findings: Finding[] = [];
  const d = durationOf(project);
  if (d == null) {
    return { status: "ran", findings: [{ gate: id, severity: "error", code: "no-duration", message: "Could not read the timeline duration.", fix: "Run `hyperframes timeline` in the project and fix what it reports." }] };
  }
  const [min, max] = genre.duration?.band ?? [0, Infinity];
  if (d < min || d > max) {
    findings.push({ gate: id, severity: "error", code: "out-of-band", message: `${d}s is outside the ${genre.id} band ${min}–${max}s.`, fix: "Recut to the genre band, or route to a different genre." });
  }
  const target = parseSeconds(project.brief.length ?? project.storyboard.duration);
  const tol = genre.duration?.tolerance ?? 0.15;
  if (target != null) {
    const [lo, hi] = Array.isArray(target) ? target : [target, target];
    if (d < lo * (1 - tol) || d > hi * (1 + tol)) {
      findings.push({ gate: id, severity: "warning", code: "off-brief", message: `${d}s vs brief length ${project.brief.length ?? project.storyboard.duration} (±${Math.round(tol * 100)}%).`, fix: "Cut or extend beats; never stretch holds to hit a number." });
    }
  }
  return { status: "ran", findings, data: { duration: d, target } };
}
