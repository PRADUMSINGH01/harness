// Cross-run memory: one line per judged variant. Seeding reads it so axis values that keep
// winning for a genre get exploited, while the other variant slots keep exploring.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { MEMORY_DIR } from "./config.ts";

export interface Lesson {
  ts: string;
  genre: string;
  run: string;
  variant: string;
  seed: Record<string, string>;
  technical: number;
  judge: number | null;
  final: number | null;
  rank: number | null;
  winner: boolean;
  vetoed: boolean;
}

const file = () => join(MEMORY_DIR, "lessons.jsonl");

export function appendLessons(lessons: Lesson[]) {
  if (!lessons.length) return;
  mkdirSync(MEMORY_DIR, { recursive: true });
  appendFileSync(file(), lessons.map((l) => JSON.stringify(l)).join("\n") + "\n");
}

export function readLessons(genre?: string): Lesson[] {
  if (!existsSync(file())) return [];
  return readFileSync(file(), "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as Lesson;
      } catch {
        return null;
      }
    })
    .filter((l): l is Lesson => !!l && (!genre || l.genre === genre));
}

export interface AxisValueStat {
  n: number;
  wins: number;
  // Posterior mean of the final score, shrunk toward PRIOR so one lucky run can't dominate.
  posterior: number;
}

const PRIOR_MEAN = 60;
const PRIOR_WEIGHT = 2;

export function axisStats(genre: string): Record<string, Record<string, AxisValueStat>> {
  const stats: Record<string, Record<string, { n: number; wins: number; sum: number }>> = {};
  for (const l of readLessons(genre)) {
    // A vetoed variant still teaches: it scores 0.
    const score = l.vetoed ? 0 : l.final;
    if (score == null) continue;
    for (const [axis, value] of Object.entries(l.seed)) {
      stats[axis] ??= {};
      stats[axis][value] ??= { n: 0, wins: 0, sum: 0 };
      stats[axis][value].n++;
      stats[axis][value].sum += score;
      if (l.winner) stats[axis][value].wins++;
    }
  }
  const out: Record<string, Record<string, AxisValueStat>> = {};
  for (const [axis, values] of Object.entries(stats)) {
    out[axis] = {};
    for (const [value, s] of Object.entries(values)) {
      out[axis][value] = { n: s.n, wins: s.wins, posterior: (s.sum + PRIOR_MEAN * PRIOR_WEIGHT) / (s.n + PRIOR_WEIGHT) };
    }
  }
  return out;
}
