// Vector ledger, statically (motion-doctrine Part 1). The numeric runtime check is the `seam` gate.
import type { Finding, GateResult, Genre } from "../types.ts";
import type { Project } from "../project.ts";
import { durationOf } from "../project.ts";

export const id = "ledger";
export const needsBrowser = false;

const AXES = new Set(["x", "y", "z"]);
const vec = (v) => `${v.axis}${v.dir > 0 ? "+" : "-"}`;
const NAMES = { "x-": "LEFT", "x+": "RIGHT", "y-": "UP", "y+": "DOWN", "z+": "PUSH", "z-": "PULL" };

export function sceneCount(project) {
  return Math.max(project.sceneFiles.length, 1);
}

export function run(project: Project, genre?: Genre): GateResult {
  const rules = genre.ledger ?? {};
  const findings: Finding[] = [];
  const add = (severity, code, message, fix, extra = {}) => findings.push({ gate: id, severity, code, message, fix, file: "ledger.json", ...extra });
  const scenes = sceneCount(project);

  // Crossfades named in a product-launch storyboard are carrier-less seams.
  const crossfades = [...(project.storyboardText ?? "").matchAll(/transition_in\s*:\s*["']?(crossfade|blur-crossfade)/gi)];
  if (crossfades.length && rules.flagCrossfades !== false) {
    add("warning", "crossfade-seam", `${crossfades.length} storyboard seam(s) use ${[...new Set(crossfades.map((m) => m[1]))].join("/")} — no carrier, the eye's momentum dies at the cut.`, "Use push-slide in the film's current direction; spend zoom-through only on a state change.", { file: "STORYBOARD.md" });
  }

  if (project.ledgerError) {
    add("error", "ledger-invalid", `ledger.json does not parse: ${project.ledgerError}`, "Fix the JSON.");
    return { status: "ran", findings };
  }
  if (!project.ledger) {
    if (rules.requireAtScenes && scenes >= rules.requireAtScenes) {
      add(rules.missingSeverity ?? "error", "no-ledger", `${scenes} scenes but no ledger.json — seams were authored scene by scene.`, "Write ledger.json (motion-doctrine/references/seam-gate.md) before assembling; stamp seams with seam-stamp.mjs.");
    }
    return { status: "ran", findings, data: { scenes, seams: 0 } };
  }

  const seams = Array.isArray(project.ledger.seams) ? project.ledger.seams : [];
  if (!seams.length) add("error", "ledger-empty", "ledger.json has no seams[].", "One row per scene boundary.");
  const duration = durationOf(project);
  let prevCut = -Infinity;
  const cutRows = [];
  for (const [i, s] of seams.entries()) {
    const label = s.id ?? `#${i}`;
    if (typeof s.cut !== "number") add("error", "ledger-row", `${label}: cut must be seconds on the master clock.`, "Set cut to the frame the incoming side ignites.");
    else {
      if (s.cut <= prevCut) add("error", "ledger-order", `${label}: cut ${s.cut}s is not after the previous cut.`, "Order seams by time.");
      if (duration && s.cut >= duration) add("error", "ledger-range", `${label}: cut ${s.cut}s is beyond the ${duration}s timeline.`, "Re-time the ledger to the real (VO-synced) durations.");
      prevCut = s.cut;
    }
    const type = s.type ?? "cut";
    if (type === "match-cut" || type === "morph") {
      if (!s.carrier?.out || !s.carrier?.in) add("error", "ledger-row", `${label}: ${type} needs carrier.out and carrier.in selectors.`, "Name the element handed across the cut.");
      continue;
    }
    const { exit, entry } = s;
    const ok = (v) => v && typeof v.selector === "string" && AXES.has(v.axis) && (v.dir === 1 || v.dir === -1);
    if (!ok(exit) || !ok(entry)) {
      add("error", "ledger-row", `${label}: exit/entry need selector, axis (x|y|z), dir (±1).`, "Use seam-gate.mjs probe --t <cut> to find the movers.");
      continue;
    }
    if (exit.axis !== entry.axis || exit.dir !== entry.dir) {
      add("error", "vector-mismatch", `${label}: exits ${NAMES[vec(exit)]} but enters ${NAMES[vec(entry)]} — a mirrored or traded vector.`, "Fix the plan, not the easing: same axis, same signed direction on both sides.");
    }
    cutRows.push({ label, v: vec(exit), technique: s.technique ?? "" });
  }

  if (cutRows.length) {
    const counts = new Map();
    for (const r of cutRows) counts.set(r.v, (counts.get(r.v) ?? 0) + 1);
    const [current, currentCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const reserved = cutRows.length - currentCount;
    const maxReserved = rules.maxReservedShare ?? 0.4;
    if (cutRows.length >= 3 && reserved / cutRows.length > maxReserved) {
      add("warning", "reserved-sprawl", `Only ${currentCount}/${cutRows.length} seams ride the current (${NAMES[current]}); reserved vectors are being spent as variety.`, "Default every ordinary seam to the current; spend UP / Z on reveals and arrivals only.");
    }
    for (let i = 1; i < cutRows.length; i++) {
      const a = cutRows[i - 1].v;
      const b = cutRows[i].v;
      if (a[0] === b[0] && a[1] !== b[1]) {
        add("error", "ping-pong", `${cutRows[i - 1].label} → ${cutRows[i].label}: consecutive seams reverse direction (${NAMES[a]} then ${NAMES[b]}).`, "Keep the current, or give the flip a visible cause (click, impact) and mark it.");
      }
    }
    const techniques = new Set(cutRows.map((r) => r.technique.replace(/\b(LEFT|RIGHT|UP|DOWN)\b/gi, "").trim().toLowerCase()).filter(Boolean));
    const maxT = rules.maxTransitionTypes ?? 3;
    if (techniques.size > maxT) {
      add("warning", "transition-sprawl", `${techniques.size} transition types (${[...techniques].join(", ")}); doctrine budget is 2–3, repeated.`, "Pick 2–3 and repeat them; morphs don't count.");
    }
    return { status: "ran", findings, data: { scenes, seams: seams.length, current: NAMES[current], reserved } };
  }
  return { status: "ran", findings, data: { scenes, seams: seams.length } };
}
