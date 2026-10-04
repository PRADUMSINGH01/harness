export type Severity = "error" | "warning" | "info";

export interface Finding {
  gate: string;
  severity: Severity;
  code: string;
  message: string;
  fix?: string;
  file?: string;
  line?: number;
  time?: number;
  selector?: string;
}

export interface GateResult {
  status: "ran" | "skipped" | "crashed";
  reason?: string;
  findings: Finding[];
  data?: Record<string, unknown>;
}

export interface GateWeights {
  hard?: boolean;
  error?: number;
  warning?: number;
  cap?: number;
}

export interface JudgeDimension {
  id: string;
  weight: number;
  question: string;
  anchors: Record<string, string>;
}

export interface Axis {
  id: string;
  label: string;
  values?: string[];
  // Directory under the vendored skills/ whose entries are the values (stays in sync with upstream).
  fromDir?: string;
  guidance?: string;
  // File (relative to the vendored repo) describing the chosen value; `{value}` is substituted.
  // Inlined into the worker packet so the builder doesn't spend turns finding it.
  file?: string;
}

export interface Genre {
  id: string;
  label: string;
  workflow: string;
  description: string;
  defaultVariants: number;
  repairRounds: number;
  duration: { band: [number, number]; tolerance: number };
  motion?: Record<string, number>;
  density?: Record<string, number>;
  ledger?: Record<string, any>;
  check: { atTransitions?: boolean; frameCheck?: string | boolean; captionZone?: string; strict?: boolean; layout?: string };
  seam: { enabled: boolean; hard: boolean; note?: string };
  proofTimes: number[];
  gates: Record<string, GateWeights>;
  blend: { technical: number; judge: number };
  axes: Axis[];
  judge: { dimensions: JudgeDimension[]; fatal: string[] };
  doctrine: string[];
  budget?: { maxTurns?: number; maxInputTokens?: number; maxMinutes?: number };
  // Files (relative to the vendored repo) every builder of this genre needs; inlined into the packet.
  essentials: string[];
}
