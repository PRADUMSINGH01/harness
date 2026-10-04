// Run state on disk (runs/<id>/run.json) with an in-memory cache; the server is the only writer.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { RUNS_DIR } from "../config.ts";
import { readJson, writeJson } from "../util.ts";
import type { Seed } from "./seeds.ts";
import type { Score } from "../score.ts";

export type VariantStatus = "pending" | "initialized" | "building" | "waiting-build" | "built" | "gating" | "repairing" | "gated" | "failed";
export type RunStatus = "created" | "initializing" | "building" | "comparing" | "judging" | "waiting-judges" | "decided" | "failed";

export interface BriefInput {
  message: string;
  subject?: string;
  length?: string;
  aspect?: string;
  audience?: string;
  destination?: string;
  language?: string;
  url?: string;
  style_preset?: string;
  intent?: string;
  notes?: string;
  // Library ids ("official/stripe_official_logo"), file paths inside the harness, or full requests.
  assets?: (string | AssetRequest)[];
  // Brands whose official logo should be fetched (media-use → theSVG) and marked required.
  logos?: string[];
}

export interface AssetRequest {
  id?: string;
  path?: string;
  role?: string;
  required?: boolean;
  notes?: string;
}

// An asset request after validation, staged into every variant at init.
export interface RunAsset {
  source: "library" | "file" | "logo";
  ref: string; // library id, absolute file path, or brand
  kind?: string;
  name?: string;
  role?: string;
  required: boolean;
  notes?: string;
}

export interface VariantState {
  id: string;
  label: string; // blind label shown to judges
  dir: string;
  seed: Seed;
  status: VariantStatus;
  buildAttempts: number;
  // Model spend across all build attempts of this variant.
  usage?: { prompt: number; completion: number; minutes: number; builds: number };
  gate?: Pick<Score, "technical" | "hardFail" | "unverified" | "counts"> & { at: string; contactSheet?: string | null; frames?: string[] };
  error?: string;
}

export interface Scorecard {
  judge: string;
  label: string;
  scores: Record<string, { score: number; evidence: string }>;
  fatal: string[];
  top_fix: string;
  notes?: string;
}

export interface Ranked {
  variant: string;
  label: string;
  technical: number;
  judge: number | null;
  judgeSpread: number | null;
  final: number | null;
  vetoed: boolean;
  reasons: string[];
  topFixes: string[];
}

export interface RunState {
  id: string;
  genre: string;
  workflow: string;
  createdAt: string;
  updatedAt: string;
  status: RunStatus;
  brief: BriefInput;
  locks: Record<string, string>;
  drivers: { builder: string; judge: string; judges: number; builderModel?: string; judgeModel?: string };
  assets?: RunAsset[];
  // Set when a server restart interrupted paid work; nothing runs until POST /runs/:id/resume.
  paused?: string;
  variants: VariantState[];
  compare?: { sheets: { at: number; path: string }[]; error?: string };
  scorecards: Scorecard[];
  // Judges whose driver failed or whose answers stayed invalid; they are not re-dispatched.
  judgeFailed?: string[];
  decision?: { at: string; winner: string | null; ranking: Ranked[] };
  error?: string;
}

const cache = new Map<string, RunState>();

export const runDir = (id: string) => join(RUNS_DIR, id);

export function saveRun(run: RunState) {
  run.updatedAt = new Date().toISOString();
  cache.set(run.id, run);
  writeJson(join(runDir(run.id), "run.json"), run);
}

export function getRun(id: string): RunState | null {
  if (cache.has(id)) return cache.get(id)!;
  const path = join(runDir(id), "run.json");
  if (!existsSync(path)) return null;
  const run = readJson(path) as RunState;
  cache.set(id, run);
  return run;
}

export function listRuns(): RunState[] {
  if (!existsSync(RUNS_DIR)) return [];
  return readdirSync(RUNS_DIR)
    .map((id) => getRun(id))
    .filter((r): r is RunState => !!r)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function variantOf(run: RunState, id: string): VariantState {
  const v = run.variants.find((x) => x.id === id || x.label === id);
  if (!v) throw Object.assign(new Error(`no variant ${id} in run ${run.id}`), { status: 404 });
  return v;
}
