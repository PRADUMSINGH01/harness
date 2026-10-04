import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Isolate memory before any module reads MEMORY_DIR.
process.env.HF_HARNESS_MEMORY = mkdtempSync(join(tmpdir(), "hf-mem-"));

const { getGenre, axisValues } = await import("../src/genres.ts");
const { planSeeds } = await import("../src/runs/seeds.ts");
const { decide, validateScorecard, judgeScore } = await import("../src/runs/decide.ts");
const { appendLessons } = await import("../src/memory.ts");

test("frame presets and palettes come from the vendored skills", () => {
  const presets = axisValues(getGenre("product-launch").axes.find((a) => a.id === "frame_preset")!);
  assert.ok(presets.includes("coral") && presets.length >= 10, presets.join(","));
  const palettes = axisValues(getGenre("motion-graphics").axes.find((a) => a.id === "palette")!);
  assert.ok(palettes.includes("dark-premium"));
});

test("seeds are reproducible, diverse, and honor locks", () => {
  const g = getGenre("product-launch");
  const a = planSeeds(g, 3, "run-x");
  assert.deepEqual(a, planSeeds(g, 3, "run-x"));
  for (let i = 0; i < a.length; i++)
    for (let j = i + 1; j < a.length; j++) {
      const diff = Object.keys(a[i].values).filter((k) => a[i].values[k] !== a[j].values[k]).length;
      assert.ok(diff >= 3, `seeds ${i},${j} differ on only ${diff} axes`);
    }
  const locked = planSeeds(g, 3, "run-y", { frame_preset: "coral" });
  assert.ok(locked.every((s) => s.values.frame_preset === "coral"));
});

test("with enough history, slot 1 exploits the winning values", () => {
  const g = getGenre("motion-graphics");
  const win = { signature_move: "dataviz-countup", palette: "dark-premium", current: g.axes[2].values![0], tempo: g.axes[3].values![0] };
  appendLessons(
    Array.from({ length: 8 }, (_, i) => ({
      ts: "t",
      genre: g.id,
      run: `r${i}`,
      variant: "v1",
      seed: i % 2 ? win : { ...win, signature_move: "typewriter-reveal", palette: "pastel-soft" },
      technical: 90,
      judge: i % 2 ? 85 : 40,
      final: i % 2 ? 87 : 55,
      rank: i % 2 ? 1 : 2,
      winner: i % 2 === 1,
      vetoed: false,
    })),
  );
  const seeds = planSeeds(g, 4, "run-z");
  assert.equal(seeds[0].strategy, "exploit");
  assert.equal(seeds[0].values.signature_move, "dataviz-countup");
  assert.equal(seeds[0].values.palette, "dark-premium");
  assert.ok(seeds.slice(1).every((s) => s.strategy === "explore"));
});

function card(genre: any, label: string, judge: string, score: number, fatal: string[] = []) {
  return {
    judge,
    label,
    scores: Object.fromEntries(genre.judge.dimensions.map((d: any) => [d.id, { score, evidence: "t=1.2s: headline lands on the beat" }])),
    fatal,
    top_fix: "tighten the opening hold",
  };
}

test("scorecards without evidence or with missing dimensions are rejected", () => {
  const g = getGenre("short-video");
  assert.deepEqual(validateScorecard(card(g, "A", "j1", 7), g, ["A", "B"]), []);
  const bad: any = card(g, "A", "j1", 7);
  bad.scores.hook = { score: 11, evidence: "nice" };
  delete bad.scores.story;
  const errors = validateScorecard(bad, g, ["A", "B"]);
  assert.ok(errors.some((e) => e.includes("hook.score")));
  assert.ok(errors.some((e) => e.includes("hook.evidence")));
  assert.ok(errors.some((e) => e.includes("story")));
  assert.ok(validateScorecard(card(g, "Z", "j1", 7), g, ["A", "B"]).some((e) => e.startsWith("label")));
});

test("decision blends technical and judge, and vetoes hard fails and majority-fatal", () => {
  const g = getGenre("short-video");
  const v = (id: string, label: string, technical: number, hardFail = false) => ({
    id,
    label,
    dir: id,
    seed: { id, strategy: "explore" as const, values: {} },
    status: "gated" as const,
    buildAttempts: 1,
    gate: { technical, hardFail, unverified: [], counts: { errors: 0, warnings: 0 }, at: "" },
  });
  const run: any = {
    variants: [v("v1", "A", 95), v("v2", "B", 70), v("v3", "C", 100, true), v("v4", "D", 90)],
    scorecards: [
      card(g, "A", "j1", 6), card(g, "A", "j2", 6),
      card(g, "B", "j1", 9), card(g, "B", "j2", 8),
      card(g, "D", "j1", 9, ["text unreadable in a key beat"]), card(g, "D", "j2", 9, ["text unreadable in a key beat"]),
    ],
  };
  assert.equal(judgeScore(run.scorecards[0], g), 60);
  const { winner, ranking } = decide(run, g);
  // B: 0.35*70 + 0.65*85 = 79.75 beats A: 0.35*95 + 0.65*60 = 72.25
  assert.equal(winner, "v2");
  assert.equal(ranking[0].final, 79.8);
  assert.ok(ranking.find((r) => r.variant === "v3")!.vetoed, "hard fail");
  assert.ok(ranking.find((r) => r.variant === "v4")!.vetoed, "both judges flagged fatal");
  assert.equal(ranking.find((r) => r.variant === "v2")!.judgeSpread, 7.1);
});

test("build budgets come from the genre, halve for repairs, and env overrides them", async () => {
  const { buildBudget } = await import("../src/drivers/builder.ts");
  const mg = buildBudget(1, getGenre("motion-graphics"));
  assert.deepEqual(mg, { maxTurns: 25, budget: { maxInputTokens: 600000, maxMinutes: 8 } });
  assert.deepEqual(buildBudget(2, getGenre("motion-graphics")).budget, { maxInputTokens: 300000, maxMinutes: 4 });
  assert.equal(buildBudget(1, getGenre("product-launch")).maxTurns, 40);
  process.env.HARNESS_BUILDER_MAX_TURNS = "12";
  assert.equal(buildBudget(1, getGenre("product-launch")).maxTurns, 12);
  delete process.env.HARNESS_BUILDER_MAX_TURNS;
});
