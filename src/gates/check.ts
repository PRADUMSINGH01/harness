// `hyperframes check`: lint + runtime + layout + motion + WCAG contrast in one browser session,
// tuned per genre (transition sampling, frame check, caption keep-out band).
import type { Finding, GateResult, Genre } from "../types.ts";
import type { Project } from "../project.ts";
import { parseJsonOut, runHf } from "../hf.ts";

export const id = "check";
export const needsBrowser = true;

const SECTIONS = ["lint", "runtime", "layout", "motion", "contrast"] as const;

// The project dir goes first and every option carries an explicit `=value`: a bare
// `--frame-check .` makes the CLI read "." as the frame-check spec and reject the whole run.
export function checkArgs(project: Project, genre: Genre): string[] {
  const args = ["check", ".", "--json"];
  if (genre.check.atTransitions) args.push("--at-transitions");
  if (genre.check.frameCheck === true) args.push("--frame-check=severity=warning");
  else if (typeof genre.check.frameCheck === "string") args.push(`--frame-check=${genre.check.frameCheck}`);
  if (genre.check.captionZone && project.hasCaptions) args.push(`--caption-zone=${genre.check.captionZone}`);
  if (genre.check.layout) args.push(`--layout=${genre.check.layout}`);
  if (genre.check.strict) args.push("--strict");
  return args;
}

export async function run(project: Project, genre: Genre): Promise<GateResult> {
  const r = await runHf(checkArgs(project, genre), { cwd: project.root, timeoutMs: 600_000 });
  const json = parseJsonOut(r.stdout);
  if (!json) {
    return {
      status: "crashed",
      reason: r.timedOut ? "hyperframes check timed out" : "hyperframes check produced no JSON",
      findings: [
        {
          gate: id,
          severity: "error",
          code: "check-crashed",
          message: `${r.timedOut ? "Timed out" : `Exited ${r.code}`}: ${(r.stderr || r.stdout).trim().split(/\r?\n/).slice(-6).join(" | ")}`,
          fix: "Run `npx hyperframes check` in the project and fix the first error it prints.",
        },
      ],
    };
  }
  // `check` reports CLI-level failures as {ok:false, error} with no sections. That is a failed
  // check, never a clean one.
  if (json.error || !SECTIONS.some((s) => json[s])) {
    return {
      status: "crashed",
      reason: "hyperframes check did not run",
      findings: [
        {
          gate: id,
          severity: "error",
          code: "check-error",
          message: `hyperframes check failed before checking anything: ${String(json.error ?? "no lint/runtime/layout sections in its output").slice(0, 300)}`,
          fix: "Run `npx hyperframes check .` in the project and fix what it reports.",
        },
      ],
      data: { args: checkArgs(project, genre).join(" ") },
    };
  }
  const findings: Finding[] = [];
  const summary: Record<string, { errors: number; warnings: number }> = {};
  for (const section of SECTIONS) {
    const s = json[section];
    if (!s) continue;
    summary[section] = { errors: s.errorCount ?? 0, warnings: s.warningCount ?? 0 };
    for (const f of s.findings ?? []) {
      if (f.severity !== "error" && f.severity !== "warning") continue;
      findings.push({
        gate: `${id}.${section}`,
        severity: f.severity,
        code: f.code ?? section,
        message: f.message ?? JSON.stringify(f).slice(0, 200),
        fix: f.fixHint,
        file: f.sourceFile ? String(f.sourceFile).split(/[\\/]/).slice(-2).join("/") : undefined,
        time: typeof f.time === "number" ? f.time : undefined,
        selector: f.selector,
      });
    }
  }
  return { status: "ran", findings, data: { ok: json.ok, summary, args: checkArgs(project, genre).join(" ") } };
}
