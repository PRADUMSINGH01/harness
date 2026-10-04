// Technical score: 100 minus capped, weighted penalties per gate. A hard gate with any error
// vetoes the variant regardless of score.
import type { Finding, GateResult, Genre } from "./types.ts";

export interface Score {
  technical: number;
  hardFail: boolean;
  hardFailures: Finding[];
  penalties: Record<string, number>;
  counts: { errors: number; warnings: number };
  // Browser gates that were skipped or crashed; the score is provisional until they run.
  unverified: string[];
}

const DEFAULT_WEIGHTS = { hard: false, error: 10, warning: 2, cap: 30 };

// `check.layout` findings are weighted by the `check` entry unless the genre names the section.
function weightsFor(gate: string, genre: Genre) {
  return { ...DEFAULT_WEIGHTS, ...(genre.gates[gate.split(".")[0]] ?? {}), ...(genre.gates[gate] ?? {}) };
}

export function scoreGates(gates: Record<string, GateResult>, genre: Genre): Score {
  const penalties: Record<string, number> = {};
  const hardFailures: Finding[] = [];
  let errors = 0;
  let warnings = 0;
  const byGate = new Map<string, Finding[]>();
  for (const result of Object.values(gates)) {
    for (const f of result.findings) {
      if (!byGate.has(f.gate)) byGate.set(f.gate, []);
      byGate.get(f.gate)!.push(f);
    }
  }
  for (const [gate, findings] of byGate) {
    const w = weightsFor(gate, genre);
    const e = findings.filter((f) => f.severity === "error");
    const wn = findings.filter((f) => f.severity === "warning");
    errors += e.length;
    warnings += wn.length;
    penalties[gate] = Math.min(w.cap, e.length * w.error + wn.length * w.warning);
    if (w.hard) hardFailures.push(...e);
  }
  const unverified = Object.entries(gates)
    .filter(([id, r]) => ["check", "snapshot"].includes(id) && r.status !== "ran")
    .map(([id]) => id);
  const technical = Math.max(0, 100 - Object.values(penalties).reduce((a, b) => a + b, 0));
  return { technical, hardFail: hardFailures.length > 0, hardFailures, penalties, counts: { errors, warnings }, unverified };
}
