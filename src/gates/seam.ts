// The numeric Seam Gate from the vendored motion-doctrine skill: measures every ledger seam
// in headless Chrome (exit still moving, entry mid-flight, direction, Z sign, zero overlap,
// carrier continuity). The script is macOS-first, so the harness supplies Chrome and runs the
// preview server itself.
import { existsSync } from "node:fs";
import type { Finding, GateResult, Genre } from "../types.ts";
import type { Project } from "../project.ts";
import { SEAM_GATE } from "../config.ts";
import { chromePath, killChildrenOf, parseJsonOut, runNode, startPreview } from "../hf.ts";

export const id = "seam";
export const needsBrowser = true;

export async function run(project: Project, genre: Genre): Promise<GateResult> {
  if (!genre.seam.enabled) return { status: "skipped", reason: "seam gate disabled for this genre", findings: [] };
  if (!project.ledger) return { status: "skipped", reason: "no ledger.json (the ledger gate reports whether one is required)", findings: [] };
  if (!existsSync(SEAM_GATE)) return { status: "skipped", reason: `seam-gate.mjs not found at ${SEAM_GATE}`, findings: [] };
  const chrome = await chromePath();
  if (!chrome) return { status: "skipped", reason: "no Chrome found (run `npx hyperframes browser ensure`)", findings: [] };

  // Own the preview server instead of letting seam-gate spawn one: its cleanup relies on POSIX
  // process groups (and `sh`), which leak the server and Chrome on Windows.
  const preview = await startPreview(project.root);
  let r;
  try {
    r = await runNode(SEAM_GATE, ["verify", "--ledger", "ledger.json", "--url", preview.url, "--json"], {
      cwd: project.root,
      timeoutMs: 600_000,
      env: { CHROME_PATH: chrome },
    });
  } finally {
    preview.stop();
  }
  await killChildrenOf(r.pid);
  const results = parseJsonOut(r.stdout);
  const severity = genre.seam.hard ? "error" : "warning";
  if (!Array.isArray(results)) {
    return {
      status: "crashed",
      reason: "seam-gate produced no JSON",
      findings: [
        {
          gate: id,
          severity: "warning",
          code: "seam-crashed",
          message: `seam-gate exited ${r.code}: ${(r.stderr || r.stdout).trim().split(/\r?\n/).slice(-4).join(" | ")}`,
          fix: "Run seam-gate.mjs verify by hand with --json to see the failure.",
        },
      ],
    };
  }
  const findings: Finding[] = [];
  for (const seam of results) {
    for (const row of seam.rows ?? []) {
      if (row.status !== "FAIL" && row.status !== "WARN") continue;
      findings.push({
        gate: id,
        severity: row.status === "FAIL" ? severity : "warning",
        code: row.check,
        message: `${seam.id} @${seam.cut}s: ${row.detail}`,
        fix: genre.seam.hard ? "Fix the seam motion (cut-the-curve), or the ledger row if the plan was wrong; then re-verify." : genre.seam.note,
        time: seam.cut,
      });
    }
  }
  return { status: "ran", findings, data: { seams: results.length } };
}
