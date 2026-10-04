// Variant seeding. Best-of-N only beats one-shot when the N candidates are genuinely different,
// so seeds are picked to maximize pairwise distance across the creative axes. With enough
// history, slot 1 exploits the axis values that have won before for this genre.
import type { Genre } from "../types.ts";
import { axisValues } from "../genres.ts";
import { axisStats, readLessons } from "../memory.ts";
import { rng } from "../util.ts";

export interface Seed {
  id: string;
  strategy: "exploit" | "explore";
  values: Record<string, string>;
}

const MIN_LESSONS_TO_EXPLOIT = 6;

const distance = (a: Record<string, string>, b: Record<string, string>) => Object.keys(a).filter((k) => a[k] !== b[k]).length;

export function planSeeds(
  genre: Genre,
  n: number,
  runId: string,
  locks: Record<string, string> = {},
  axisOptions: Record<string, string[]> = {},
): Seed[] {
  const random = rng(runId);
  const pick = <T,>(xs: T[]) => xs[Math.floor(random() * xs.length)];
  const options: Record<string, string[]> = {};
  for (const axis of genre.axes) {
    const values = locks[axis.id] ? [locks[axis.id]] : axisOptions[axis.id]?.length ? axisOptions[axis.id] : axisValues(axis);
    options[axis.id] = values.length ? values : ["(workflow default)"];
  }
  const randomSeed = () => Object.fromEntries(Object.entries(options).map(([k, vs]) => [k, pick(vs)]));

  const seeds: Seed[] = [];
  if (readLessons(genre.id).length >= MIN_LESSONS_TO_EXPLOIT) {
    const stats = axisStats(genre.id);
    const values = Object.fromEntries(
      Object.entries(options).map(([axis, vs]) => {
        const ranked = vs
          .map((v) => ({ v, p: stats[axis]?.[v]?.posterior ?? -1 }))
          .sort((a, b) => b.p - a.p);
        return [axis, ranked[0].p >= 0 ? ranked[0].v : pick(vs)];
      }),
    );
    seeds.push({ id: "v1", strategy: "exploit", values });
  }

  const pool = Array.from({ length: 400 }, randomSeed);
  while (seeds.length < n) {
    let best = pool[0];
    let bestScore = -1;
    for (const candidate of pool) {
      const minDist = seeds.length ? Math.min(...seeds.map((s) => distance(candidate, s.values))) : 0;
      // Random tie-break keeps equal-distance choices reproducible but not alphabetical.
      const score = minDist + random() * 0.5;
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    seeds.push({ id: `v${seeds.length + 1}`, strategy: "explore", values: best });
  }
  return seeds;
}
