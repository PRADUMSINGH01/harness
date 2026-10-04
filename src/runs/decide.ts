// Scorecard validation and the winner decision.
import type { Genre } from "../types.ts";
import type { Ranked, RunState, Scorecard } from "./store.ts";
import { mean, round, stdev } from "../util.ts";

const FATAL_MINORITY_PENALTY = 10;

export function validateScorecard(card: any, genre: Genre, labels: string[]): string[] {
  const errors: string[] = [];
  if (!card || typeof card !== "object") return ["scorecard must be an object"];
  if (typeof card.judge !== "string" || !card.judge) errors.push("judge: required string id");
  if (!labels.includes(card.label)) errors.push(`label: must be one of ${labels.join(", ")}`);
  if (!card.scores || typeof card.scores !== "object") errors.push("scores: required object");
  else {
    for (const dim of genre.judge.dimensions) {
      const s = card.scores[dim.id];
      if (!s) {
        errors.push(`scores.${dim.id}: missing`);
        continue;
      }
      if (!Number.isInteger(s.score) || s.score < 1 || s.score > 10) errors.push(`scores.${dim.id}.score: integer 1-10`);
      // Evidence must point at a frame, or the score is a vibe.
      if (typeof s.evidence !== "string" || !/\d/.test(s.evidence) || s.evidence.length < 12) {
        errors.push(`scores.${dim.id}.evidence: cite a timestamp or frame and what is visible there`);
      }
    }
  }
  if (!Array.isArray(card.fatal)) errors.push("fatal: required array (empty when none)");
  if (typeof card.top_fix !== "string" || card.top_fix.length < 8) errors.push("top_fix: the single change that would most raise this variant's score");
  return errors;
}

export function judgeScore(card: Scorecard, genre: Genre): number {
  let sum = 0;
  let weight = 0;
  for (const dim of genre.judge.dimensions) {
    const s = card.scores[dim.id]?.score;
    if (typeof s !== "number") continue;
    sum += dim.weight * s;
    weight += dim.weight;
  }
  return weight ? (sum / weight) * 10 : 0;
}

export function decide(run: RunState, genre: Genre): { winner: string | null; ranking: Ranked[] } {
  const judges = [...new Set(run.scorecards.map((c) => c.judge))];
  const ranking: Ranked[] = run.variants.map((v) => {
    const reasons: string[] = [];
    const technical = v.gate?.technical ?? 0;
    let vetoed = false;
    if (v.status === "failed") {
      vetoed = true;
      reasons.push(`build failed: ${v.error ?? "unknown"}`);
    }
    if (v.gate?.hardFail) {
      vetoed = true;
      reasons.push("hard gate failed");
    }
    const cards = run.scorecards.filter((c) => c.label === v.label);
    const scores = cards.map((c) => judgeScore(c, genre));
    let judge = mean(scores);
    const fatalCards = cards.filter((c) => c.fatal.length > 0);
    if (fatalCards.length && fatalCards.length * 2 > Math.max(cards.length, 1)) {
      vetoed = true;
      reasons.push(`judges flagged fatal: ${[...new Set(fatalCards.flatMap((c) => c.fatal))].join("; ")}`);
    } else if (fatalCards.length && judge != null) {
      judge -= FATAL_MINORITY_PENALTY;
      reasons.push(`minority fatal flag (-${FATAL_MINORITY_PENALTY}): ${fatalCards.flatMap((c) => c.fatal).join("; ")}`);
    }
    const final = judge == null ? (judges.length ? null : technical) : genre.blend.technical * technical + genre.blend.judge * judge;
    return {
      variant: v.id,
      label: v.label,
      technical: round(technical),
      judge: round(judge),
      judgeSpread: scores.length > 1 ? round(stdev(scores)) : null,
      final: round(final),
      vetoed,
      reasons,
      topFixes: cards.map((c) => c.top_fix),
    };
  });
  ranking.sort((a, b) => Number(a.vetoed) - Number(b.vetoed) || (b.final ?? -1) - (a.final ?? -1) || (b.judge ?? -1) - (a.judge ?? -1));
  const winner = ranking.find((r) => !r.vetoed && r.final != null)?.variant ?? null;
  return { winner, ranking };
}
