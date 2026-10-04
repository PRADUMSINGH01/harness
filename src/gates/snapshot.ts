// Proof snapshots: the judge's eyes. Opening, signature move, scene midpoints, both sides of
// every ledger cut, and the final hold, stitched into one contact sheet.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import type { GateResult, Genre } from "../types.ts";
import { type Project, durationOf } from "../project.ts";
import { runHf } from "../hf.ts";

export const id = "snapshot";
export const needsBrowser = true;
const MAX_FRAMES = 16;

export function proofTimes(project: Project, genre: Genre): number[] {
  const d = durationOf(project);
  if (!d) return [];
  const times = genre.proofTimes.map((f) => f * d);
  for (const track of project.timeline?.tracks ?? []) {
    for (const row of track.rows ?? []) {
      if (row.src && String(row.src).endsWith(".html") && !row.nested) times.push((row.absStart + row.absEnd) / 2);
    }
  }
  for (const seam of project.ledger?.seams ?? []) {
    if (typeof seam.cut === "number") times.push(seam.cut - 0.1, seam.cut + 0.2);
  }
  const clamped = times.map((t) => Math.min(Math.max(t, 0.05), d - 0.05)).map((t) => Math.round(t * 100) / 100);
  const unique = [...new Set(clamped)].sort((a, b) => a - b);
  if (unique.length <= MAX_FRAMES) return unique;
  // Keep the spread: sample evenly across the sorted list.
  return Array.from({ length: MAX_FRAMES }, (_, i) => unique[Math.round((i * (unique.length - 1)) / (MAX_FRAMES - 1))]);
}

export async function run(project: Project, genre: Genre): Promise<GateResult> {
  const times = proofTimes(project, genre);
  if (!times.length) return { status: "skipped", reason: "no duration to sample", findings: [] };
  const outDir = join(project.root, ".harness", "snapshots");
  rmSync(outDir, { recursive: true, force: true });
  const r = await runHf(["snapshot", "--at", times.join(","), "-o", outDir, "--describe", "false", "."], {
    cwd: project.root,
    timeoutMs: 600_000,
  });
  const files = existsSync(outDir) ? readdirSync(outDir).sort() : [];
  const frames = files.filter((f) => f.endsWith(".png")).map((f) => relative(project.root, join(outDir, f)).split("\\").join("/"));
  const sheet = files.includes("contact-sheet.jpg") ? relative(project.root, join(outDir, "contact-sheet.jpg")).split("\\").join("/") : null;
  if (r.code !== 0 || !frames.length) {
    return {
      status: "crashed",
      reason: "snapshot failed",
      findings: [
        {
          gate: id,
          severity: "error",
          code: "snapshot-failed",
          message: `hyperframes snapshot exited ${r.code}: ${(r.stderr || r.stdout).trim().split(/\r?\n/).slice(-4).join(" | ")}`,
          fix: "Without proof frames nobody can judge the film. Fix the composition until snapshot runs.",
        },
      ],
    };
  }
  return { status: "ran", findings: frozenFindings(project.root, frames, times), data: { times, frames, contactSheet: sheet } };
}

// Identical proof frames mean nothing moves: a blank entry, a timeline that never advances under
// seek, or motion driven by callbacks the renderer suppresses.
export function frozenFindings(root: string, frames: string[], times: number[]) {
  if (frames.length < 3) return [];
  const hashes = frames.map((f) => createHash("sha1").update(readFileSync(join(root, f))).digest("hex"));
  const distinct = new Set(hashes).size;
  if (distinct === 1) {
    return [
      {
        gate: id,
        severity: "error" as const,
        code: "static-film",
        message: `All ${frames.length} proof frames (t=${times.join(", ")}s) are pixel-identical: nothing on screen changes over time.`,
        fix: "Check index.html is your composition, and drive motion with tweens on real properties (not onUpdate callbacks, which seeking suppresses).",
      },
    ];
  }
  const repeats = hashes.filter((h, i) => i > 0 && h === hashes[i - 1]).length;
  if (repeats / (frames.length - 1) > 0.5) {
    return [
      {
        gate: id,
        severity: "warning" as const,
        code: "mostly-static",
        message: `${repeats} of ${frames.length - 1} consecutive proof-frame pairs are identical: long stretches with nothing moving.`,
        fix: "Give every phase a sustained-motion route; a held frame should be a deliberate beat, not dead air.",
      },
    ];
  }
  return [];
}
