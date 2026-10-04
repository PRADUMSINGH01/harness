import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Axis, Genre } from "./types.ts";
import { GENRES_DIR, HF_SKILLS } from "./config.ts";

let cache: Record<string, Genre> | null = null;

export function loadGenres(): Record<string, Genre> {
  if (cache) return cache;
  cache = {};
  for (const name of readdirSync(GENRES_DIR).filter((f) => f.endsWith(".json"))) {
    const genre = JSON.parse(readFileSync(join(GENRES_DIR, name), "utf8")) as Genre;
    cache[genre.id] = genre;
  }
  return cache;
}

export function getGenre(id: string): Genre {
  const genre = loadGenres()[id];
  if (!genre) throw new HttpError(400, `unknown genre "${id}"; expected one of ${Object.keys(loadGenres()).join(", ")}`);
  return genre;
}

// Axis values either live in the genre file or are read from the vendored skills,
// so new frame presets / palettes upstream show up without editing the harness.
export function axisValues(axis: Axis): string[] {
  if (axis.values?.length) return axis.values;
  if (!axis.fromDir) return [];
  const dir = join(HF_SKILLS, axis.fromDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => !name.startsWith(".") && !name.startsWith("_"))
    .filter((name) => statSync(join(dir, name)).isDirectory() || name.endsWith(".md"))
    .map((name) => name.replace(/\.md$/, ""))
    .sort();
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
