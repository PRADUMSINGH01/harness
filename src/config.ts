import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

export const HARNESS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Provider keys live in harness/.env (or the file HARNESS_ENV_FILE names). Real env vars win.
const envFile = process.env.HARNESS_ENV_FILE ?? join(HARNESS_ROOT, ".env");
if (existsSync(envFile)) loadEnvFile(envFile);
// The vendored HyperFrames clone. Override with HF_ROOT to point at another checkout.
export const HF_ROOT = process.env.HF_ROOT ? resolve(process.env.HF_ROOT) : join(HARNESS_ROOT, "hyperframes");
export const HF_SKILLS = join(HF_ROOT, "skills");
// Repo-native doctrine chain (motion-doctrine, cut-the-curve, seam-craft, ...).
export const DOCTRINE_SKILLS = join(HF_ROOT, ".claude", "skills");
export const SEAM_GATE = join(DOCTRINE_SKILLS, "motion-doctrine", "scripts", "seam-gate.mjs");
export const SEAM_STAMP = join(DOCTRINE_SKILLS, "motion-doctrine", "scripts", "seam-stamp.mjs");
export const GENRES_DIR = join(HARNESS_ROOT, "genres");
export const MEMORY_DIR = process.env.HF_HARNESS_MEMORY ? resolve(process.env.HF_HARNESS_MEMORY) : join(HARNESS_ROOT, "memory");
export const RUNS_DIR = process.env.HF_HARNESS_RUNS ? resolve(process.env.HF_HARNESS_RUNS) : join(HARNESS_ROOT, "runs");
export const PROMPTS_DIR = join(HARNESS_ROOT, "prompts");
export const PORT = Number(process.env.HARNESS_PORT ?? 8100);
// The address clients reach the server at; links in API responses (players, frames, downloads) use it.
export const PUBLIC_URL = (process.env.HARNESS_PUBLIC_URL ?? `http://localhost:${PORT}`).replace(/\/+$/, "");
// Optional shared secret. When set, every route except health and the API docs requires it.
export const API_KEY = process.env.HARNESS_API_KEY?.trim() || undefined;
// Browser gates (check, snapshot, seam) each launch Chrome; keep them few on a laptop.
export const BROWSER_CONCURRENCY = Number(process.env.HARNESS_BROWSER_CONCURRENCY ?? 1);
export const BUILD_CONCURRENCY = Number(process.env.HARNESS_BUILD_CONCURRENCY ?? 3);
