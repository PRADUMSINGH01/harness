// The project's root index.html is the deliverable: it is what check, snapshot, the player, the
// judge, and render all play. Catch a builder that wrote its film somewhere else.
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Finding, GateResult, Genre } from "../types.ts";
import type { Project } from "../project.ts";

export const id = "entry";
export const needsBrowser = false;

// Fingerprints of `hyperframes init --example=blank`: the placeholder title and the commented example tween.
const BLANK_TITLE = /<h1[^>]*id="title"[^>]*>\s*Title\s*<\/h1>/i;
const BLANK_EXAMPLE = /\/\/\s*Example:\s*tl\.fromTo/;

export function run(project: Project, _genre?: Genre): GateResult {
  const findings: Finding[] = [];
  const index = project.index;
  if (!index || !existsSync(join(project.root, "index.html"))) {
    findings.push({ gate: id, severity: "error", code: "no-entry", message: "No index.html at the project root.", fix: "Write the composition to PROJECT_DIR/index.html.", file: "index.html" });
    return { status: "ran", findings };
  }
  if (BLANK_TITLE.test(index.html) && BLANK_EXAMPLE.test(index.html)) {
    findings.push({
      gate: id,
      severity: "error",
      code: "blank-entry",
      message: "index.html is still the blank `hyperframes init` template, so every gate, the player, and render show a placeholder title, not your film.",
      fix: "Make index.html the composition, or mount your composition from it with data-composition-src.",
      file: "index.html",
    });
  }
  const mounted = new Set([...index.html.matchAll(/data-composition-src="([^"]+)"/g)].map((m) => m[1].replace(/^\.\//, "")));
  for (const f of project.sceneFiles) {
    const isComponent = f.rel.startsWith("compositions/components/");
    if (!isComponent && !mounted.has(f.rel)) {
      findings.push({
        gate: id,
        severity: mounted.size === 0 ? "error" : "warning",
        code: "unmounted",
        message: `${f.rel} is never mounted from index.html (no data-composition-src="${f.rel}"), so it plays nowhere.`,
        fix: "Mount it from index.html, move its content into index.html, or delete it.",
        file: f.rel,
      });
    }
  }
  return { status: "ran", findings, data: { mounted: [...mounted] } };
}
