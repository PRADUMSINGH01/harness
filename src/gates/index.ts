// Gate runner: loads the project once, runs static gates, then browser gates, then scores.
import { join } from "node:path";
import type { GateResult, Genre } from "../types.ts";
import { loadProject, loadTimeline } from "../project.ts";
import { writeJson } from "../util.ts";
import { scoreGates, type Score } from "../score.ts";
import * as motion from "./motion.ts";
import * as determinism from "./determinism.ts";
import * as density from "./density.ts";
import * as ledger from "./ledger.ts";
import * as duration from "./duration.ts";
import * as entry from "./entry.ts";
import * as assetsGate from "./assets.ts";
import * as check from "./check.ts";
import * as lint from "./lint.ts";
import * as seam from "./seam.ts";
import * as snapshot from "./snapshot.ts";

interface Gate {
  id: string;
  needsBrowser: boolean;
  // Runs only on static passes; a browser gate covers it otherwise.
  staticOnly?: boolean;
  run: (project: any, genre: Genre) => GateResult | Promise<GateResult>;
}

export const GATES: Gate[] = [entry, assetsGate, duration, motion, determinism, density, ledger, lint, check, seam, snapshot];

export interface GateReport {
  project: string;
  genre: string;
  startedAt: string;
  finishedAt: string;
  browser: boolean;
  gates: Record<string, GateResult & { ms: number }>;
  score: Score;
}

export interface GateOptions {
  browser?: boolean;
  only?: string[];
  // Browser gates launch Chrome; the caller serializes them across variants.
  withBrowserSlot?: <T>(fn: () => Promise<T>) => Promise<T>;
  onProgress?: (message: string) => void;
}

export async function runGates(projectDir: string, genre: Genre, opts: GateOptions = {}): Promise<GateReport> {
  const browser = opts.browser !== false;
  const startedAt = new Date().toISOString();
  const project = loadProject(projectDir);
  await loadTimeline(project);
  const gates: GateReport["gates"] = {};
  const slot = opts.withBrowserSlot ?? ((fn) => fn());

  for (const gate of GATES) {
    if (opts.only && !opts.only.includes(gate.id)) continue;
    if (gate.staticOnly && browser) continue;
    if (gate.needsBrowser && !browser) {
      gates[gate.id] = { status: "skipped", reason: "browser gates disabled", findings: [], ms: 0 };
      continue;
    }
    opts.onProgress?.(`gate ${gate.id}`);
    const t0 = Date.now();
    try {
      const result = gate.needsBrowser ? await slot(() => Promise.resolve(gate.run(project, genre))) : await gate.run(project, genre);
      gates[gate.id] = { ...result, ms: Date.now() - t0 };
    } catch (e) {
      gates[gate.id] = {
        status: "crashed",
        reason: (e as Error).message,
        findings: [{ gate: gate.id, severity: "error", code: "gate-crashed", message: (e as Error).stack?.split("\n").slice(0, 3).join(" | ") ?? String(e) }],
        ms: Date.now() - t0,
      };
    }
  }

  const report: GateReport = {
    project: project.root,
    genre: genre.id,
    startedAt,
    finishedAt: new Date().toISOString(),
    browser,
    gates,
    score: scoreGates(gates, genre),
  };
  writeJson(join(project.root, ".harness", "gates.json"), report);
  return report;
}
