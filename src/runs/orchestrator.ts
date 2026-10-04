// The run state machine: init variants -> build (driver) -> gate + repair -> compare -> blind judge -> decide.
// `advance()` is idempotent: it reads the run's state and starts whatever is next. Builds, gates and
// judges run in the background and call `advance()` again when they finish.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
import { BROWSER_CONCURRENCY, BUILD_CONCURRENCY, HARNESS_ROOT } from "../config.ts";
import { type AssetKind, getAsset, readStaged, stageAsset } from "../assets/catalog.ts";
import { fetchLogo, stageLocalFile } from "../assets/tools.ts";
import type { Genre } from "../types.ts";
import { getGenre, HttpError } from "../genres.ts";
import { emit, Limiter } from "../events.ts";
import { runHf } from "../hf.ts";
import { runGates, type GateReport } from "../gates/index.ts";
import { appendLessons } from "../memory.ts";
import { isInside, rng, writeText } from "../util.ts";
import { builderDriver } from "../drivers/builder.ts";
import { judgeDriver } from "../drivers/judge.ts";
import { planSeeds } from "./seeds.ts";
import { decide, validateScorecard } from "./decide.ts";
import { ensureBrandKit } from "./brandkit.ts";
import { renderJudgePacket, renderRepairPacket, renderWorkerPacket } from "./packets.ts";
import {
  type AssetRequest,
  type BriefInput,
  getRun,
  listRuns,
  runDir,
  type RunAsset,
  saveRun,
  type RunState,
  type Scorecard,
  type VariantState,
  variantOf,
} from "./store.ts";

export const browserSlots = new Limiter(BROWSER_CONCURRENCY);
const buildSlots = new Limiter(BUILD_CONCURRENCY);
const active = new Map<string, Promise<unknown>>(); // `${run}/${variant}` or `${run}/judge` -> in-flight work
const aborts = new Map<string, AbortController>();
const advancing = new Map<string, Promise<void>>();
let serverUrl = "http://localhost:8100";

export function setServerUrl(url: string) {
  serverUrl = url;
}

const COMPARE_FRACTIONS = [0.12, 0.5, 0.88];
const ASPECTS: Record<string, string> = { "1920x1080": "landscape", "16:9": "landscape", "1080x1920": "portrait", "9:16": "portrait", "1080x1080": "square", "1:1": "square" };

export interface CreateRunInput {
  genre: string;
  brief: BriefInput;
  n?: number;
  name?: string;
  locks?: Record<string, string>;
  builder?: string;
  judge?: string;
  judges?: number;
  builderModel?: string;
  judgeModel?: string;
  // Per-run seed menus: restrict an axis to values that suit this brief (e.g. website-friendly moves).
  axisOptions?: Record<string, string[]>;
  start?: boolean;
}

// The first configured vision provider judges by default; with none configured, scorecards come from outside.
async function defaultJudge(): Promise<string> {
  for (const id of ["gemini", "zai", "dashscope", "openai"]) {
    if ((await judgeDriver(id).check()).ok) return id;
  }
  return "external";
}

export async function createRun(input: CreateRunInput): Promise<RunState> {
  const genre = getGenre(input.genre);
  if (!input.brief?.message?.trim()) throw new HttpError(400, "brief.message is required: the one thing the video must communicate");
  const builder = builderDriver(input.builder ?? process.env.HARNESS_BUILDER ?? "external");
  const judge = judgeDriver(input.judge ?? process.env.HARNESS_JUDGE ?? (await defaultJudge()));
  for (const [d, model, role] of [[builder, input.builderModel, "builder"], [judge, input.judgeModel, "judge"]] as const) {
    const c = await d.check(model);
    if (!c.ok) throw new HttpError(400, `${role} "${d.id}": ${c.reason ?? "unavailable"}`);
  }
  const n = Math.min(Math.max(input.n ?? genre.defaultVariants, 1), 8);
  const slug = (input.name ?? input.brief.subject ?? input.brief.message)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const id = `${new Date().toISOString().slice(0, 10)}-${slug || genre.id}-${Math.random().toString(36).slice(2, 6)}`;
  const locks = { ...(input.locks ?? {}), ...(input.brief.style_preset ? { frame_preset: input.brief.style_preset } : {}) };
  for (const [axis, values] of Object.entries(input.axisOptions ?? {})) {
    if (!genre.axes.some((a) => a.id === axis)) throw new HttpError(400, `axisOptions: unknown axis "${axis}" for ${genre.id}`);
    if (!Array.isArray(values) || !values.length) throw new HttpError(400, `axisOptions.${axis}: give a non-empty array`);
  }
  const assets = resolveAssetRequests(input.brief);
  const seeds = planSeeds(genre, n, id, locks, input.axisOptions);
  // Blind labels: shuffled so "A" is not always the exploit slot.
  const random = rng(`${id}:labels`);
  const labels = seeds.map((_, i) => String.fromCharCode(65 + i)).sort(() => random() - 0.5);
  const now = new Date().toISOString();
  const run: RunState = {
    id,
    genre: genre.id,
    workflow: genre.workflow,
    createdAt: now,
    updatedAt: now,
    status: "created",
    brief: input.brief,
    locks,
    drivers: {
      builder: builder.id,
      judge: judge.id,
      judges: Math.min(Math.max(input.judges ?? 1, 1), 5),
      ...(input.builderModel ? { builderModel: input.builderModel } : {}),
      ...(input.judgeModel ? { judgeModel: input.judgeModel } : {}),
    },
    assets,
    variants: seeds.map((seed, i) => ({
      id: seed.id,
      label: labels[i],
      dir: join(runDir(id), "variants", seed.id),
      seed,
      status: "pending",
      buildAttempts: 0,
    })),
    scorecards: [],
  };
  saveRun(run);
  emit(id, "run.created", `${genre.label}, ${n} variants, builder=${builder.id}, judge=${judge.id} x${run.drivers.judges}`, { data: { seeds } });
  if (input.start !== false) void advance(id);
  return run;
}

// Serialize advances per run so two finishing workers can't both start the compare step.
export function advance(runId: string): Promise<void> {
  const prev = advancing.get(runId) ?? Promise.resolve();
  const next = prev.then(() => step(runId)).catch((e) => {
    const run = getRun(runId);
    if (run) {
      run.status = "failed";
      run.error = (e as Error).message;
      saveRun(run);
    }
    emit(runId, "run.failed", (e as Error).stack ?? String(e));
  });
  advancing.set(runId, next);
  return next;
}

async function step(runId: string) {
  const run = getRun(runId);
  if (!run || run.status === "decided" || run.status === "failed" || run.paused) return;
  const genre = getGenre(run.genre);

  if (run.status === "created" || run.status === "initializing") {
    run.status = "initializing";
    saveRun(run);
    await initVariants(run, genre);
    run.status = "building";
    saveRun(run);
  }

  if (run.status === "building") {
    for (const v of run.variants) {
      const key = `${run.id}/${v.id}`;
      if (active.has(key)) continue;
      if (v.status === "initialized") track(key, buildVariant(run, v, genre));
      else if (v.status === "built") track(key, gateVariant(run, v, genre));
    }
    const terminal = run.variants.every((v) => v.status === "gated" || v.status === "failed");
    if (!terminal) return;
    run.status = "comparing";
    saveRun(run);
  }

  if (run.status === "comparing") {
    await compareVariants(run);
    run.status = "judging";
    saveRun(run);
  }

  if (run.status === "judging" || run.status === "waiting-judges") {
    const eligible = eligibleVariants(run);
    if (!eligible.length) {
      emit(run.id, "judge.skipped", "no variant passed the hard gates; nothing to judge");
      return finish(run, genre);
    }
    const key = `${run.id}/judge`;
    if (active.has(key)) return;
    const missing = missingJudges(run, eligible);
    if (!missing.length) return finish(run, genre);
    track(key, judgeRun(run, genre, missing, eligible), judgeDriver(run.drivers.judge).external ? undefined : run.id);
  }
}

// `thenAdvance` re-runs the state machine once the work is no longer marked active; advancing from
// inside the work itself would see its own key and stop.
function track(key: string, work: Promise<unknown>, thenAdvance?: string) {
  active.set(key, work);
  work.finally(() => {
    active.delete(key);
    if (thenAdvance) void advance(thenAdvance);
  });
}

const eligibleVariants = (run: RunState) => run.variants.filter((v) => v.status === "gated" && !v.gate?.hardFail);

function missingJudges(run: RunState, eligible: VariantState[]) {
  const ids = Array.from({ length: run.drivers.judges }, (_, i) => `j${i + 1}`).filter((j) => !run.judgeFailed?.includes(j));
  return ids.filter((j) => eligible.some((v) => !run.scorecards.some((c) => c.judge === j && c.label === v.label)));
}

async function initVariants(run: RunState, genre: Genre) {
  const variantsDir = join(runDir(run.id), "variants");
  mkdirSync(variantsDir, { recursive: true });
  await stageSharedCapture(run, genre);
  const resolution = ASPECTS[run.brief.aspect ?? ""];
  for (const v of run.variants) {
    if (v.status !== "pending") continue;
    rmSync(v.dir, { recursive: true, force: true });
    const args = ["init", v.id, "--non-interactive", "--example=blank", `--skill=${genre.workflow}`, ...(resolution ? [`--resolution=${resolution}`] : [])];
    // Keep the global skill set stable for the whole run; the vendored clone is the source of truth.
    const r = await runHf(args, { cwd: variantsDir, timeoutMs: 300_000, env: { HYPERFRAMES_SKIP_SKILLS: "1" } });
    if (r.code !== 0 || !existsSync(join(v.dir, "hyperframes.json"))) {
      v.status = "failed";
      v.error = `init failed: ${(r.stderr || r.stdout).trim().split(/\r?\n/).slice(-3).join(" | ")}`;
      emit(run.id, "variant.failed", v.error, { variant: v.id });
      saveRun(run);
      continue;
    }
    const shared = join(runDir(run.id), "shared");
    if (existsSync(shared)) cpSync(shared, v.dir, { recursive: true });
    await stageRunAssets(run, v);
    writeText(join(v.dir, "BRIEF.md"), briefMarkdown(run, genre, v));
    writeText(join(v.dir, "VARIANT.md"), variantMarkdown(run, genre, v));
    v.status = "initialized";
    saveRun(run);
    emit(run.id, "variant.initialized", `seed ${Object.values(v.seed.values).join(" / ")}`, { variant: v.id });
  }
}

// Copy the brief's assets into the variant (renders are self-contained), record them in
// assets/ASSETS.md + assets.json, and register them in media-use's ledger.
async function stageRunAssets(run: RunState, v: VariantState) {
  if (!run.assets?.length) return;
  for (const a of run.assets) {
    const extra = { role: a.role, required: a.required, notes: a.notes };
    try {
      if (a.source === "library") stageAsset(v.dir, getAsset(a.ref)!, extra);
      else if (a.source === "file") stageLocalFile(v.dir, a.ref, (a.kind as AssetKind) ?? "photo", { ...extra, name: a.name });
      else await fetchLogo(v.dir, a.ref, { ...extra, role: a.role ?? "brand logo" });
    } catch (e) {
      emit(run.id, "asset.failed", `${a.source} ${a.ref}: ${(e as Error).message}`, { variant: v.id });
    }
  }
  await runHf(["media-use", "resolve", "--adopt", "--project", "."], { cwd: v.dir, timeoutMs: 120_000 });
  emit(run.id, "assets.staged", `${readStaged(v.dir).length} assets in assets/`, { variant: v.id });
}

const KIND_BY_EXT: Record<string, AssetKind> = {
  png: "photo", jpg: "photo", jpeg: "photo", webp: "photo", gif: "photo", svg: "illustration", json: "lottie",
  mp4: "video", webm: "video", mov: "video", mp3: "audio", wav: "audio", m4a: "audio", woff: "font", woff2: "font", ttf: "font", otf: "font",
};

// Validate the brief's asset requests up front, so a typo fails the request instead of a build.
export function resolveAssetRequests(brief: BriefInput): RunAsset[] {
  const out: RunAsset[] = [];
  for (const raw of brief.assets ?? []) {
    const req: AssetRequest = typeof raw === "string" ? { id: raw } : raw;
    const ref = req.id ?? req.path;
    if (!ref) throw new HttpError(400, "each brief.assets entry needs an id (library) or a path");
    const lib = getAsset(ref);
    if (lib) {
      out.push({ source: "library", ref: lib.id, kind: lib.kind, name: lib.name, role: req.role, required: req.required ?? true, notes: req.notes });
      continue;
    }
    const file = resolve(HARNESS_ROOT, ref);
    if (existsSync(file) && statSync(file).isFile()) {
      if (!isInside(HARNESS_ROOT, file)) {
        throw new HttpError(400, `asset ${ref} is outside the harness folder; upload it (POST /assets) or move it under harness/`);
      }
      const ext = extname(file).slice(1).toLowerCase();
      out.push({ source: "file", ref: file, kind: KIND_BY_EXT[ext] ?? "photo", name: basename(file), role: req.role, required: req.required ?? true, notes: req.notes });
      continue;
    }
    throw new HttpError(400, `unknown asset "${ref}": not a library id (GET /assets?q=...) and not a file inside the harness`);
  }
  for (const brand of brief.logos ?? []) {
    if (!brand?.trim()) continue;
    out.push({ source: "logo", ref: brand.trim(), kind: "logo", name: `${brand.trim()} logo`, role: "brand logo", required: true });
  }
  return out;
}

// Any brief with a URL captures the site once; every variant starts from the same source truth.
async function stageSharedCapture(run: RunState, _genre: Genre) {
  const target = join(runDir(run.id), "shared", "capture");
  if (!run.brief.url) return;
  if (!existsSync(target)) await captureSite(run, target);
  if (!existsSync(target)) return;
  try {
    const kit = await ensureBrandKit(target, run.brief.url);
    const fonts = kit.fonts.map((f) => `${f.family}:${f.source}`).join(", ") || "none";
    emit(run.id, "brand.kit", `fonts ${fonts}; logos ${kit.logos.map((l) => l.path).join(", ") || "none"}`);
  } catch (e) {
    emit(run.id, "brand.failed", (e as Error).message);
  }
}

async function captureSite(run: RunState, target: string) {
  const url = run.brief.url!;
  const reuse = recentCapture(run.brief.url, run.id);
  if (reuse) {
    cpSync(reuse.dir, target, { recursive: true });
    writeText(join(runDir(run.id), "shared", ".capture-source.json"), JSON.stringify({ url: run.brief.url, at: reuse.at, from: reuse.run }) + "\n");
    emit(run.id, "capture.reused", `${run.brief.url} from run ${reuse.run} (${Math.round((Date.now() - reuse.at) / 60000)} min old)`);
    return;
  }
  emit(run.id, "capture.started", url);
  const r = await runHf(["capture", url, "-o", target, "--json"], { cwd: runDir(run.id), timeoutMs: 900_000 });
  if (r.code !== 0 || existsSync(join(target, "BLOCKED.md"))) {
    rmSync(target, { recursive: true, force: true });
    emit(run.id, "capture.failed", `each variant will capture on its own: ${(r.stderr || r.stdout).trim().split(/\r?\n/).slice(-2).join(" | ")}`);
    return;
  }
  writeText(join(runDir(run.id), "shared", ".capture-source.json"), JSON.stringify({ url: run.brief.url, at: Date.now(), from: run.id }) + "\n");
  emit(run.id, "capture.done", target);
}

const CAPTURE_MAX_AGE_MS = Number(process.env.HARNESS_CAPTURE_MAX_AGE_HOURS ?? 24) * 3_600_000;
const normalizeUrl = (u: string) => u.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");

// A site captured in the last day is reused rather than re-captured (each capture takes minutes).
function recentCapture(url: string, exceptRun: string): { dir: string; at: number; run: string } | null {
  let best: { dir: string; at: number; run: string } | null = null;
  for (const r of listRuns()) {
    if (r.id === exceptRun || !r.brief.url || normalizeUrl(r.brief.url) !== normalizeUrl(url)) continue;
    const dir = join(runDir(r.id), "shared", "capture");
    if (!existsSync(join(dir, "screenshots")) || existsSync(join(dir, "BLOCKED.md"))) continue;
    const at = statSync(join(dir, "screenshots")).mtimeMs;
    if (Date.now() - at > CAPTURE_MAX_AGE_MS) continue;
    if (!best || at > best.at) best = { dir, at, run: r.id };
  }
  return best;
}

async function buildVariant(run: RunState, v: VariantState, genre: Genre, packetText?: string) {
  const driver = builderDriver(run.drivers.builder);
  const packet = packetText ? { text: packetText } : renderWorkerPacket(run, v, genre, serverUrl, driver.external);
  v.buildAttempts++;
  v.status = driver.external ? "waiting-build" : "building";
  saveRun(run);
  emit(run.id, driver.external ? "variant.waiting" : "variant.building", driver.external ? `packet ready: GET /runs/${run.id}/variants/${v.id}/packet` : `attempt ${v.buildAttempts}`, { variant: v.id });
  if (driver.external) return;
  const abort = new AbortController();
  aborts.set(`${run.id}/${v.id}`, abort);
  const outcome = await buildSlots.run(() =>
    driver.build({
      run,
      variant: v,
      genre,
      packetText: packet.text,
      signal: abort.signal,
      log: (m) => emit(run.id, "variant.log", m, { variant: v.id }),
      emit: (type, m, data) => emit(run.id, type, m, { variant: v.id, data }),
    }),
  );
  aborts.delete(`${run.id}/${v.id}`);
  if (outcome.usage) {
    const u = (v.usage ??= { prompt: 0, completion: 0, minutes: 0, builds: 0 });
    u.prompt += outcome.usage.prompt;
    u.completion += outcome.usage.completion;
    u.minutes = Math.round((u.minutes + outcome.usage.minutes) * 10) / 10;
    u.builds++;
  }
  // Stopped by a pause, not by a defect: back in the queue for when the run resumes.
  if (getRun(run.id)?.paused) {
    v.status = "initialized";
    v.buildAttempts = Math.max(0, v.buildAttempts - 1);
    saveRun(run);
    emit(run.id, "variant.paused", "build stopped by pause; it restarts on resume", { variant: v.id });
    return;
  }
  if (outcome.status === "failed") {
    v.status = "failed";
    v.error = outcome.detail;
    saveRun(run);
    emit(run.id, "variant.failed", outcome.detail ?? "build failed", { variant: v.id, data: { costUsd: outcome.costUsd } });
    return advance(run.id);
  }
  v.status = "built";
  saveRun(run);
  emit(run.id, "variant.built", (outcome.detail ?? "").slice(0, 300), { variant: v.id, data: { costUsd: outcome.costUsd } });
  await gateVariant(run, v, genre);
}

async function gateVariant(run: RunState, v: VariantState, genre: Genre) {
  v.status = "gating";
  saveRun(run);
  emit(run.id, "variant.gating", "running gates", { variant: v.id });
  const report = await runGates(v.dir, genre, {
    withBrowserSlot: (fn) => browserSlots.run(fn),
    onProgress: (m) => emit(run.id, "variant.gate", m, { variant: v.id }),
  });
  recordGate(v, report);
  const s = report.score;
  emit(run.id, "variant.gated", `technical ${s.technical}/100, ${s.counts.errors} errors, ${s.counts.warnings} warnings${s.hardFail ? ", HARD FAIL" : ""}`, { variant: v.id });

  const driver = builderDriver(run.drivers.builder);
  if (s.hardFail && v.buildAttempts <= genre.repairRounds) {
    const repair = renderRepairPacket(run, v, genre, report, v.buildAttempts, serverUrl, driver.external);
    emit(run.id, "variant.repair", `round ${v.buildAttempts}: ${s.hardFailures.length} hard failures`, { variant: v.id, data: { packet: repair.path } });
    if (driver.external) {
      v.buildAttempts++;
      v.status = "waiting-build";
      saveRun(run);
      return;
    }
    v.status = "repairing";
    saveRun(run);
    return buildVariant(run, v, genre, repair.text);
  }
  v.status = "gated";
  saveRun(run);
  return advance(run.id);
}

function recordGate(v: VariantState, report: GateReport) {
  const snap = report.gates.snapshot?.data as any;
  v.gate = {
    technical: report.score.technical,
    hardFail: report.score.hardFail,
    unverified: report.score.unverified,
    counts: report.score.counts,
    at: report.finishedAt,
    contactSheet: snap?.contactSheet ?? null,
    frames: snap?.frames ?? [],
  };
}

async function compareVariants(run: RunState) {
  const eligible = eligibleVariants(run);
  if (eligible.length < 2) return;
  const durations = eligible.map((v) => (readGateReport(v)?.gates.duration?.data as any)?.duration).filter((d) => typeof d === "number");
  if (!durations.length) return;
  const shortest = Math.min(...durations);
  const sorted = [...eligible].sort((a, b) => a.label.localeCompare(b.label));
  const outDir = join(runDir(run.id), "compare");
  mkdirSync(outDir, { recursive: true });
  const sheets: { at: number; path: string }[] = [];
  for (const f of COMPARE_FRACTIONS) {
    const at = Math.round(f * shortest * 100) / 100;
    const out = join(outDir, `compare-${Math.round(f * 100)}.png`);
    const r = await browserSlots.run(() =>
      runHf(["compare", ...sorted.map((v) => v.dir), "--at", at, "--labels", sorted.map((v) => v.label).join(","), "--out", out], { timeoutMs: 600_000 }),
    );
    if (r.code === 0 && existsSync(out)) sheets.push({ at, path: out });
    else emit(run.id, "compare.failed", `t=${at}s: ${(r.stderr || r.stdout).trim().split(/\r?\n/).slice(-2).join(" | ")}`);
  }
  run.compare = { sheets };
  saveRun(run);
  emit(run.id, "compare.done", `${sheets.length} side-by-side sheets`);
}

export function readGateReport(v: VariantState): GateReport | null {
  const p = join(v.dir, ".harness", "gates.json");
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

async function judgeRun(run: RunState, genre: Genre, judgeIds: string[], eligible: VariantState[]) {
  const driver = judgeDriver(run.drivers.judge);
  run.status = driver.external ? "waiting-judges" : "judging";
  saveRun(run);
  // Judges are independent, so they run in parallel: N judges take about as long as one.
  await Promise.all(judgeIds.map((judgeId) => judgeOne(run, genre, driver, judgeId, eligible)));
}

async function judgeOne(run: RunState, genre: Genre, driver: ReturnType<typeof judgeDriver>, judgeId: string, eligible: VariantState[]) {
  {
    const materials = renderJudgePacket(run, genre, judgeId, eligible);
    if (driver.external) {
      emit(run.id, "judge.waiting", `packet ready: GET /runs/${run.id}/judge-packet?judge=${judgeId}`);
      return;
    }
    let correction: string | undefined;
    let complete = false;
    for (let attempt = 1; attempt <= 2 && !complete; attempt++) {
      emit(run.id, "judge.started", `${judgeId} attempt ${attempt}`);
      let outcome;
      try {
        outcome = await driver.judge({
          run,
          genre,
          judgeId,
          materials,
          correction,
          log: (m) => emit(run.id, "judge.log", m),
          emit: (type, m, data) => emit(run.id, type, m, { data }),
        });
      } catch (e) {
        outcome = { status: "failed" as const, detail: (e as Error).message };
      }
      if (outcome.status !== "done") {
        emit(run.id, "judge.failed", outcome.status === "failed" ? outcome.detail : "waiting");
        break;
      }
      const result = acceptScorecards(run, genre, outcome.cards.map((c) => ({ ...c, judge: judgeId })));
      complete = !missingJudges(run, eligible).includes(judgeId);
      if (!complete) {
        correction = result.rejected.length
          ? result.rejected.map((r) => `- ${r.label ?? "?"}: ${r.errors.join("; ")}`).join("\n")
          : `Missing scorecards for: ${eligible.filter((v) => !run.scorecards.some((c) => c.judge === judgeId && c.label === v.label)).map((v) => v.label).join(", ")}`;
        emit(run.id, "judge.rejected", correction);
      }
    }
    if (!complete) {
      run.judgeFailed = [...new Set([...(run.judgeFailed ?? []), judgeId])];
      saveRun(run);
    }
  }
}

export function acceptScorecards(run: RunState, genre: Genre, cards: any[]) {
  const eligible = eligibleVariants(run);
  const labels = eligible.map((v) => v.label);
  const accepted: Scorecard[] = [];
  const rejected: { label?: string; errors: string[] }[] = [];
  for (const card of cards) {
    const errors = validateScorecard(card, genre, labels);
    if (errors.length) {
      rejected.push({ label: card?.label, errors });
      continue;
    }
    const clean: Scorecard = { judge: card.judge, label: card.label, scores: card.scores, fatal: card.fatal, top_fix: card.top_fix, notes: card.notes };
    run.scorecards = run.scorecards.filter((c) => !(c.judge === clean.judge && c.label === clean.label));
    run.scorecards.push(clean);
    accepted.push(clean);
  }
  saveRun(run);
  if (accepted.length) emit(run.id, "judge.scorecards", `${accepted.length} accepted from ${[...new Set(accepted.map((c) => c.judge))].join(", ")}`);
  return { accepted, rejected };
}

function finish(run: RunState, genre: Genre) {
  const { winner, ranking } = decide(run, genre);
  run.decision = { at: new Date().toISOString(), winner, ranking };
  run.status = "decided";
  saveRun(run);
  writeText(join(runDir(run.id), "DECISION.md"), decisionMarkdown(run, genre));
  const rankOf = new Map(ranking.map((r, i) => [r.variant, i + 1]));
  appendLessons(
    ranking.map((r) => ({
      ts: run.decision!.at,
      genre: run.genre,
      run: run.id,
      variant: r.variant,
      seed: run.variants.find((v) => v.id === r.variant)!.seed.values,
      technical: r.technical,
      judge: r.judge,
      final: r.final,
      rank: rankOf.get(r.variant) ?? null,
      winner: r.variant === winner,
      vetoed: r.vetoed,
    })),
  );
  emit(run.id, "run.decided", winner ? `winner ${winner} (${ranking[0].label}), final ${ranking[0].final}` : "no winner: every variant was vetoed", { data: run.decision });
}

// ----- external callbacks -----

export async function markBuilt(runId: string, variantId: string) {
  const run = mustRun(runId);
  const v = variantOf(run, variantId);
  if (v.status !== "waiting-build" && v.status !== "building") throw new HttpError(409, `variant ${v.id} is ${v.status}, not waiting for a build`);
  v.status = "built";
  saveRun(run);
  emit(run.id, "variant.built", "reported by external builder", { variant: v.id });
  void advance(run.id);
  return v;
}

export async function regate(runId: string, variantId: string) {
  const run = mustRun(runId);
  const v = variantOf(run, variantId);
  if (active.has(`${run.id}/${v.id}`)) throw new HttpError(409, `variant ${v.id} is busy (${v.status})`);
  if (v.status === "pending" || v.status === "initialized") throw new HttpError(409, `variant ${v.id} has not been built`);
  if (run.status === "decided") throw new HttpError(409, "run already decided; start a new run or POST /runs/:id/reopen");
  v.status = "built";
  saveRun(run);
  void advance(run.id);
}

export function cancelRun(runId: string) {
  const run = mustRun(runId);
  for (const [key, abort] of aborts) if (key.startsWith(`${runId}/`)) abort.abort();
  run.status = "failed";
  run.error = "cancelled";
  saveRun(run);
  emit(run.id, "run.failed", "cancelled");
}

// Reopen a decided run, e.g. after late scorecards or a manual fix.
export function reopen(runId: string) {
  const run = mustRun(runId);
  run.status = run.variants.every((v) => v.status === "gated" || v.status === "failed") ? "judging" : "building";
  run.decision = undefined;
  saveRun(run);
  void advance(run.id);
  return run;
}

export function mustRun(runId: string): RunState {
  const run = getRun(runId);
  if (!run) throw new HttpError(404, `no run ${runId}`);
  return run;
}

// After a restart, work that was in flight is gone. Put those variants back where they can resume.
// Runs that spend model tokens are paused rather than relaunched: a restart must never start
// paid builds or judges on its own. POST /runs/:id/resume continues them.
export function resumeAll() {
  for (const run of listRuns()) {
    if (run.status === "decided" || run.status === "failed") continue;
    const driver = builderDriver(run.drivers.builder);
    for (const v of run.variants) {
      if (v.status === "building" || v.status === "repairing") {
        v.status = driver.external ? "waiting-build" : "initialized";
        if (!driver.external) v.buildAttempts = Math.max(0, v.buildAttempts - 1);
      }
      if (v.status === "gating") v.status = "built";
    }
    const paid = !driver.external || !judgeDriver(run.drivers.judge).external;
    if (paid) {
      run.paused = "server restarted";
      saveRun(run);
      emit(run.id, "run.paused", "server restarted; paid builds and judges wait for POST /runs/:id/resume (or the Resume button)");
      continue;
    }
    saveRun(run);
    emit(run.id, "run.resumed", `status ${run.status}`);
    void advance(run.id);
  }
}

export function resumeRun(runId: string) {
  const run = mustRun(runId);
  run.paused = undefined;
  saveRun(run);
  emit(run.id, "run.resumed", `resumed by request, status ${run.status}`);
  void advance(run.id);
  return run;
}

export function pauseRun(runId: string) {
  const run = mustRun(runId);
  for (const [key, abort] of aborts) if (key.startsWith(`${runId}/`)) abort.abort();
  run.paused = "paused by request";
  saveRun(run);
  emit(run.id, "run.paused", "paused by request; in-flight builds were stopped");
  return run;
}

// ----- markdown artifacts -----

function yaml(value: string) {
  return JSON.stringify(value);
}

function briefMarkdown(run: RunState, genre: Genre, v: VariantState) {
  const b = run.brief;
  const fm = [
    `workflow: ${genre.workflow}`,
    "flow: automation",
    "storyboard: no",
    `message: ${yaml(b.message)}`,
    b.aspect && `aspect: ${b.aspect}`,
    b.length && `length: ${b.length}`,
    b.audience && `audience: ${yaml(b.audience)}`,
    b.destination && `destination: ${b.destination}`,
    `language: ${b.language ?? "en"}`,
    b.style_preset && `style_preset: ${b.style_preset}`,
  ].filter(Boolean);
  const body = [
    "## Intent",
    "",
    b.intent ?? b.message,
    b.subject ? `\nSubject: ${b.subject}` : "",
    b.url ? `\nSource URL: ${b.url}` : "",
    briefAssets(run, v),
    "\n## Notes\n",
    b.notes ? `- ${b.notes}` : "",
    `- Built by hf-harness run \`${run.id}\`, variant \`${v.id}\`. The creative seed is in VARIANT.md and is binding.`,
    "- Autonomous: no reviewer is available. Stop before render; the harness gates and judges this build.",
  ];
  return `---\n${fm.join("\n")}\n---\n\n${body.filter((x) => x !== "").join("\n")}\n`;
}

// brief-format.md: "## Assets — the user's own material, one line each: path — what it is, where it belongs".
function briefAssets(run: RunState, v: VariantState): string {
  const staged = readStaged(v.dir);
  const missing = (run.assets ?? []).filter((a) => a.source === "logo" && !staged.some((s) => s.kind === "logo" && s.brand?.toLowerCase() === a.ref.toLowerCase()));
  if (!staged.length && !missing.length) return "";
  const lines = staged.map((s) => `- ${s.file} — ${s.name} (${s.kind}${s.role ? `, ${s.role}` : ""})${s.required ? ", **required**: must be clearly visible" : ""}${s.notes ? `. ${s.notes}` : ""}`);
  for (const m of missing) lines.push(`- (missing) official ${m.ref} logo could not be fetched; retry with fetch_logo, and never draw it by hand.`);
  return `\n## Assets\n\n${lines.join("\n")}\n\nFull details and sizes: assets/ASSETS.md.`;
}

function variantMarkdown(run: RunState, genre: Genre, v: VariantState) {
  const rows = genre.axes.map((a) => `| ${a.label} | \`${a.id}\` | ${v.seed.values[a.id]} |`).join("\n");
  const guidance = genre.axes.filter((a) => a.guidance).map((a) => `- **${a.label}:** ${a.guidance}`).join("\n");
  return `# Variant ${v.id} seed\n\nRun \`${run.id}\`, ${genre.label}, strategy: ${v.seed.strategy}.\n\n| Axis | id | Value |\n| --- | --- | --- |\n${rows}\n\n${guidance}\n`;
}

function decisionMarkdown(run: RunState, genre: Genre) {
  const d = run.decision!;
  const rows = d.ranking
    .map((r, i) => `| ${i + 1} | ${r.variant} (${r.label}) | ${r.final ?? "-"} | ${r.technical} | ${r.judge ?? "-"}${r.judgeSpread != null ? ` ±${r.judgeSpread}` : ""} | ${r.vetoed ? "vetoed" : ""} |`)
    .join("\n");
  const seeds = run.variants.map((v) => `- **${v.id}** (${v.label}, ${v.seed.strategy}): ${Object.entries(v.seed.values).map(([k, x]) => `${k}=${x}`).join("; ")}`).join("\n");
  const notes = d.ranking
    .map((r) => [`### ${r.variant} (${r.label})`, ...r.reasons.map((x) => `- ${x}`), ...r.topFixes.map((x) => `- Judge fix: ${x}`)].join("\n"))
    .join("\n\n");
  const winner = run.variants.find((v) => v.id === d.winner);
  return `# Decision: ${run.id}

${genre.label}. Message: "${run.brief.message}"

**Winner:** ${winner ? `${winner.id} (${winner.label}) at \`${winner.dir}\`` : "none. Every variant was vetoed; see the reasons below."}

Final score = ${genre.blend.technical} × technical + ${genre.blend.judge} × judge.

| Rank | Variant | Final | Technical | Judge | |
| --- | --- | --- | --- | --- | --- |
${rows}

## Seeds

${seeds}

## Reasons and judge fixes

${notes}
`;
}
