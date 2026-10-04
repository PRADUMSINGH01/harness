// `hyperframes lint`: the static half of `check`, run on static-only passes so a builder sees
// lint errors (undeclared fonts, tweens on clip elements, ...) seconds after writing the film
// instead of after its build ends. Browser passes skip it: `check` runs the same rules.
import type { Finding, GateResult, Genre } from "../types.ts";
import type { Project } from "../project.ts";
import { parseJsonOut, runHf } from "../hf.ts";

export const id = "lint";
export const needsBrowser = false;
export const staticOnly = true;

export async function run(project: Project, _genre: Genre): Promise<GateResult> {
  const r = await runHf(["lint", ".", "--json"], { cwd: project.root, timeoutMs: 120_000 });
  const json = parseJsonOut(r.stdout);
  if (!json || !Array.isArray(json.findings)) {
    return { status: "skipped", reason: r.timedOut ? "hyperframes lint timed out" : "hyperframes lint produced no JSON", findings: [] };
  }
  const findings: Finding[] = [];
  for (const f of json.findings) {
    if (f.severity !== "error" && f.severity !== "warning") continue;
    findings.push({
      // Same gate id as check's lint section, so the genre's `check` weights apply.
      gate: "check.lint",
      severity: f.severity,
      code: f.code ?? "lint",
      message: f.message ?? JSON.stringify(f).slice(0, 200),
      fix: f.fixHint,
      file: f.file ? `${String(f.file).split(/[\\/]/).slice(-2).join("/")}${f.line ? `:${f.line}` : ""}` : undefined,
      selector: f.elementId ? `#${f.elementId}` : f.selector,
    });
  }
  return { status: "ran", findings, data: { errors: json.errorCount ?? 0, warnings: json.warningCount ?? 0 } };
}
