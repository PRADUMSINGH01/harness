// Fills the prompt templates in prompts/ for builders and judges.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Genre } from "../types.ts";
import type { GateReport } from "../gates/index.ts";
import { HF_ROOT, HF_SKILLS, PROMPTS_DIR, SEAM_STAMP } from "../config.ts";
import { hfCli, hfVersion } from "../hf.ts";
import { writeText } from "../util.ts";
import { dims, readStaged } from "../assets/catalog.ts";
import { buildBudget } from "../drivers/builder.ts";
import { runDir, type RunState, type VariantState } from "./store.ts";
import { brandKitNote, readBrandKit } from "./brandkit.ts";

const fill = (template: string, vars: Record<string, string | number>) =>
  template.replace(/\{\{(\w+)\}\}/g, (m, key) => (key in vars ? String(vars[key]) : m));

const template = (name: string) => readFileSync(join(PROMPTS_DIR, name), "utf8");
const jsonPath = (p: string) => JSON.stringify(p).slice(1, -1);

export function doneInstruction(run: RunState, variant: VariantState, serverUrl: string, external: boolean) {
  return external
    ? `report completion:\n   \`\`\`bash\n   curl -s -X POST ${serverUrl}/runs/${run.id}/variants/${variant.id}/built\n   \`\`\``
    : "end your turn with a one-paragraph summary of what you built.";
}

// Every variant gets the same required assets, so one variant's list describes the brief.
function requiredAssetsLine(variants: VariantState[]): string | undefined {
  const required = variants.length ? readStaged(variants[0].dir).filter((a) => a.required) : [];
  if (!required.length) return undefined;
  const list = required.map((a) => `${a.brand ? `${a.brand} ` : ""}${a.kind === "logo" ? "logo" : `${a.name} (${a.kind})`}`).join("; ");
  return `- **Brand assets that must appear, unaltered:** ${list}. If one is absent from every frame, or visibly stretched, cropped, recolored, or redrawn, flag it as fatal.`;
}

function budgetLine(run: RunState, variant: VariantState, genre: Genre): string {
  if (["external", "claude-agent"].includes(run.drivers.builder)) {
    return "work efficiently: one composition, a few gate passes, then finish";
  }
  const b = buildBudget(Math.max(1, variant.buildAttempts), genre);
  return `about ${b.maxTurns} turns, ${Math.round(b.budget.maxInputTokens / 1000)}k input tokens, and ${b.budget.maxMinutes} minutes for this build, whichever runs out first. Every turn re-sends this whole conversation, so batch related tool calls and don't re-read files`;
}

// The usage rules, cut to what this variant needs: the general rules, logos (the most common
// ask), and the kinds actually staged. The packet is re-sent every turn, so every section costs.
function assetUsage(variant: VariantState): string {
  const kinds = new Set<string>(readStaged(variant.dir).map((a) => a.kind));
  kinds.add("logo");
  const [intro, ...sections] = template("asset-usage.md").replace(/^## How to use assets/m, "### How to use assets").split(/^(?=### )/m);
  const keep = sections.filter((s) => {
    const heading = s.split("\n")[0];
    if (!/`kind:/.test(heading)) return true;
    return [...heading.matchAll(/kind: (\w+)/g)].some((m) => kinds.has(m[1]));
  });
  return [intro, ...keep].join("").trim();
}

function assetTable(variant: VariantState): string {
  const staged = readStaged(variant.dir);
  if (!staged.length) {
    return "The brief supplied no assets. If the film needs a logo, photo, icon, texture, Lottie, or a creative-kit element (doodle, mockup, chart, lower third, wipe), find one in the library before drawing anything by hand.";
  }
  const rows = staged
    .map((a) => `| \`${a.file}\` | ${a.kind}${a.brand ? ` (${a.brand})` : ""} | ${dims(a)}${a.transparent ? ", transparent" : ""} | ${a.role ?? ""} | ${a.required ? "**yes**" : "no"} |`)
    .join("\n");
  const required = staged.filter((a) => a.required);
  return [
    "These files are already in your project (also listed in `assets/ASSETS.md`, with full metadata in `assets/assets.json`):",
    "",
    "| File | Kind | Size | Role | Required |",
    "| --- | --- | --- | --- | --- |",
    rows,
    required.length ? `\n**Required:** ${required.map((a) => `\`${a.file}\``).join(", ")} must each be clearly visible in the film. The gate fails a variant that never uses one, and the judge checks the frames.` : "",
  ].join("\n");
}

function assetAccess(run: RunState, variant: VariantState, serverUrl: string): string {
  const hasTools = !["external", "claude-agent"].includes(run.drivers.builder);
  if (hasTools) {
    return [
      "**Finding more.** The asset library holds logos, photos, screenshots, illustrations, icons, textures, Lottie, video, audio, fonts, and the creative kit (see below). Use your tools:",
      "- `search_assets` (query, optional kind) finds candidates with their size and tags.",
      "- `use_asset` (id, role) copies one into `assets/<kind>/` and returns its path, its description, a placement snippet, and for creative-kit SVGs the markup to inline.",
      "- `fetch_logo` (brand) fetches a brand's **official** logo. Never draw or retype a logo.",
    ].join("\n");
  }
  const dir = JSON.stringify(variant.dir).slice(1, -1);
  return [
    "**Finding more.** The asset library holds logos, photos, screenshots, illustrations, icons, textures, Lottie, video, audio, fonts, and the creative kit (see below):",
    "```bash",
    `curl -s "${serverUrl}/assets?q=stripe+logo&kind=logo"`,
    `curl -s -X POST ${serverUrl}/projects/assets/use -H "content-type: application/json" -d '{"projectDir": "${dir}", "id": "<asset id>", "role": "end-card logo"}'`,
    `curl -s -X POST ${serverUrl}/projects/assets/logo -H "content-type: application/json" -d '{"projectDir": "${dir}", "brand": "notion"}'`,
    "```",
    "The first searches; the second copies an asset into `assets/<kind>/` and returns its path and a placement snippet; the third fetches a brand's **official** logo. Never draw or retype a logo.",
  ].join("\n");
}

// The genre's essential files plus the file behind each seed value (blueprint, palette, preset).
export function inlinedFor(genre: Genre, variant: VariantState): { rel: string; path: string; content: string }[] {
  const rels = [...(genre.essentials ?? [])];
  for (const axis of genre.axes) {
    const value = variant.seed.values[axis.id];
    if (axis.file && value) rels.push(axis.file.replace("{value}", value));
  }
  return [...new Set(rels)]
    .map((rel) => ({ rel, path: join(HF_ROOT, rel) }))
    .filter((f) => existsSync(f.path))
    .map((f) => ({ ...f, content: readFileSync(f.path, "utf8") }));
}

export function workerPacketPath(run: RunState, variant: VariantState) {
  return join(runDir(run.id), "packets", `${variant.id}.worker.md`);
}

export function renderWorkerPacket(run: RunState, variant: VariantState, genre: Genre, serverUrl: string, external: boolean) {
  const seedTable = genre.axes
    .map((axis) => `- **${axis.label}** (\`${axis.id}\`): **${variant.seed.values[axis.id]}**${axis.guidance ? `\n  ${axis.guidance}` : ""}`)
    .join("\n");
  const sharedDir = join(runDir(run.id), "shared");
  const kit = readBrandKit(join(sharedDir, "capture"));
  const inlinedFiles = inlinedFor(genre, variant);
  const inlinedSet = new Set(inlinedFiles.map((f) => f.rel));
  const filled = fill(template("variant-worker.md"), {
    RUN_ID: run.id,
    VARIANT_ID: variant.id,
    N: run.variants.length,
    GENRE: genre.id,
    GENRE_LABEL: genre.label.toLowerCase(),
    WORKFLOW: genre.workflow,
    WORKFLOW_SKILL: join(HF_SKILLS, genre.workflow, "SKILL.md"),
    HF_SKILLS,
    HF_ROOT,
    HF_VERSION: hfVersion(),
    HF_CLI: hfCli(),
    SEAM_STAMP,
    SEAM_SCHEMA: join(HF_ROOT, ".claude", "skills", "motion-doctrine", "references", "seam-gate.md"),
    PROJECT_DIR: variant.dir,
    PROJECT_DIR_JSON: jsonPath(variant.dir),
    SERVER: serverUrl,
    DOCTRINE_LIST: genre.doctrine.filter((d) => !inlinedSet.has(d)).map((d) => `   - \`${join(HF_ROOT, d)}\``).join("\n") || "   - (none)",
    INLINED_LIST: inlinedFiles.map((f) => `- \`${f.path}\``).join("\n"),
    BUDGET: budgetLine(run, variant, genre),
    SEED_TABLE: seedTable,
    DONE_INSTRUCTION: doneInstruction(run, variant, serverUrl, external),
    SHARED_NOTE: existsSync(join(sharedDir, "capture"))
      ? [
          `The harness captured ${run.brief.url ?? "the site"} once and staged it in \`capture/\` in your PROJECT_DIR. Every variant uses this same source truth, so do not recapture.`,
          "- `capture/screenshots/full-page.png` is the whole page at 1x, and `scroll-*.png` are viewport-sized shots. These are your real plates: animate the camera over them, and overlay or rebuild only what must move.",
          "- `capture/extracted/visible-text.txt` holds the page's real copy, and `tokens.json` its colors and fonts. Use the brand's palette and type, never invented ones.",
          "- `capture/assets/` holds the captured SVGs. Reference files from the project; never hotlink the live site.",
          "Show the product as it really is. Don't invent UI, features, prices, or claims that aren't in the capture.",
          ...(kit ? ["", brandKitNote(kit)] : []),
        ].join("\n")
      : existsSync(sharedDir)
        ? "The harness staged shared material into your PROJECT_DIR. Use it as-is: every variant must start from the same source truth."
        : "None. Source everything the workflow needs yourself.",
  });
  // Inline last, so template placeholders can never match text inside the inlined files.
  const text = filled
    .replace("{{ASSET_TABLE}}", () => assetTable(variant))
    .replace("{{ASSET_ACCESS}}", () => assetAccess(run, variant, serverUrl))
    .replace("{{ASSET_USAGE}}", () => assetUsage(variant))
    .replace("{{INLINED}}", () => inlinedFiles.map((f) => `<file path="${f.path}">\n${f.content.trim()}\n</file>`).join("\n\n"));
  const path = workerPacketPath(run, variant);
  writeText(path, text);
  return { path, text };
}

export function renderRepairPacket(run: RunState, variant: VariantState, genre: Genre, report: GateReport, round: number, serverUrl: string, external: boolean) {
  const findings = Object.values(report.gates)
    .flatMap((g) => g.findings)
    .sort((a, b) => (a.severity === "error" ? 0 : 1) - (b.severity === "error" ? 0 : 1))
    .slice(0, 60)
    .map((f) => {
      const where = [f.file && `${f.file}${f.line ? `:${f.line}` : ""}`, f.time != null && `t=${f.time}s`, f.selector].filter(Boolean).join(" ");
      return `- **${f.severity.toUpperCase()}** \`${f.gate}/${f.code}\`${where ? ` (${where})` : ""}: ${f.message}${f.fix ? `\n  Fix: ${f.fix}` : ""}`;
    })
    .join("\n");
  const text = fill(template("repair.md"), {
    ROUND: round,
    MAX_ROUNDS: genre.repairRounds,
    RUN_ID: run.id,
    VARIANT_ID: variant.id,
    PROJECT_DIR: variant.dir,
    PROJECT_DIR_JSON: jsonPath(variant.dir),
    GENRE: genre.id,
    TECHNICAL: report.score.technical,
    HARD_FAIL: String(report.score.hardFail),
    PACKET_PATH: workerPacketPath(run, variant),
    HF_CLI: hfCli(),
    FINDINGS: findings || "- (no findings recorded; rerun the self-gate to see why it failed)",
    SERVER: serverUrl,
    DONE_INSTRUCTION: doneInstruction(run, variant, serverUrl, external),
  });
  const path = join(runDir(run.id), "packets", `${variant.id}.repair-${round}.md`);
  writeText(path, text);
  return { path, text };
}

export interface JudgeMaterials {
  text: string;
  path: string;
  // Images in the order the text lists them, for drivers that attach images inline.
  images: { label: string; path: string; caption: string }[];
}

export function renderJudgePacket(run: RunState, genre: Genre, judgeId: string, variants: VariantState[]): JudgeMaterials {
  const brief = run.brief;
  const briefText = [
    `- **Message (the one thing it must communicate):** ${brief.message}`,
    brief.subject && `- **Subject:** ${brief.subject}`,
    brief.audience && `- **Audience:** ${brief.audience}`,
    brief.length && `- **Length:** ${brief.length}`,
    brief.aspect && `- **Aspect:** ${brief.aspect}`,
    brief.destination && `- **Destination:** ${brief.destination}`,
    brief.url && `- **Product URL:** ${brief.url}`,
    brief.intent && `- **Intent:** ${brief.intent}`,
    requiredAssetsLine(variants),
  ]
    .filter(Boolean)
    .join("\n");
  const rubric = genre.judge.dimensions
    .map((d) => `### \`${d.id}\` (weight ${d.weight})\n${d.question}\n${Object.entries(d.anchors).map(([k, v]) => `- **${k}**: ${v}`).join("\n")}`)
    .join("\n\n");
  const images: JudgeMaterials["images"] = [];
  const materials: string[] = [];
  for (const v of [...variants].sort((a, b) => a.label.localeCompare(b.label))) {
    const lines = [`### Candidate ${v.label}`];
    if (v.gate?.contactSheet) {
      const p = join(v.dir, v.gate.contactSheet);
      images.push({ label: v.label, path: p, caption: `Candidate ${v.label}: contact sheet of all proof frames` });
      lines.push(`- Contact sheet: \`${p}\``);
    }
    for (const f of v.gate?.frames ?? []) {
      const p = join(v.dir, f);
      const t = f.match(/at-([\d.]+)s/)?.[1];
      images.push({ label: v.label, path: p, caption: `Candidate ${v.label}: frame at t=${t}s` });
      lines.push(`- t=${t}s: \`${p}\``);
    }
    materials.push(lines.join("\n"));
  }
  for (const sheet of run.compare?.sheets ?? []) {
    images.push({ label: "*", path: sheet.path, caption: `All candidates side by side at t=${sheet.at}s` });
    materials.push(`### Side by side at t=${sheet.at}s\n- \`${sheet.path}\``);
  }
  const text = fill(template("judge.md"), {
    GENRE_LABEL: genre.label,
    RUN_ID: run.id,
    COUNT: variants.length,
    LABELS: variants.map((v) => v.label).sort().join(", "),
    BRIEF: briefText,
    RUBRIC: rubric,
    FATAL: genre.judge.fatal.map((f) => `- ${f}`).join("\n"),
    MATERIALS: materials.join("\n\n"),
    JUDGE_ID: judgeId,
    SCORE_SKELETON: genre.judge.dimensions.map((d) => `      "${d.id}": { "score": 0, "evidence": "t=..s: ..." }`).join(",\n"),
  });
  const path = join(runDir(run.id), "packets", `judge-${judgeId}.md`);
  writeText(path, text);
  return { text, path, images };
}
