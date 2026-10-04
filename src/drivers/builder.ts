// Builder drivers: who actually executes a HyperFrames workflow for one variant.
//   external      the server publishes the packet and waits for POST /runs/:id/variants/:v/built
//                 (your agent/ pipeline, a Claude Code session, a person).
//   claude-agent  the Claude Agent SDK runs the packet in-process, inside the variant directory.
import { HF_ROOT } from "../config.ts";
import { bashPath, runAgent } from "../llm/agent.ts";
import { checkProvider, clientFor, modelFor, provider, providers, requestExtras } from "../llm/providers.ts";
import { createTraceLog } from "../llm/tracelog.ts";
import { assetTools } from "../assets/tools.ts";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import type { Genre } from "../types.ts";
import { runDir, type RunState, type VariantState } from "../runs/store.ts";

export interface BuildContext {
  run: RunState;
  variant: VariantState;
  genre: Genre;
  packetText: string;
  log: (message: string) => void;
  // Structured progress events (agent.thinking, agent.tool, ...) for this variant.
  emit: (type: string, message: string, data?: unknown) => void;
  signal: AbortSignal;
}

export interface BuildOutcome {
  status: "built" | "waiting" | "failed";
  detail?: string;
  costUsd?: number;
  usage?: { prompt: number; completion: number; minutes: number };
}

export interface BuilderDriver {
  id: string;
  external: boolean;
  check(model?: string): Promise<{ ok: boolean; reason?: string }>;
  build(ctx: BuildContext): Promise<BuildOutcome>;
}

const external: BuilderDriver = {
  id: "external",
  external: true,
  async check() {
    return { ok: true };
  },
  async build() {
    return { status: "waiting", detail: "packet published; waiting for an external builder to POST .../built" };
  },
};

const WORKER_SYSTEM_APPEND = [
  "You are a HyperFrames variant worker inside an automated best-of-N harness.",
  "No human is available: never ask questions or wait for approval. Make the call and record it in NOTES.md.",
  "Work only inside the current working directory. The vendored HyperFrames skills are readable at their absolute paths.",
].join(" ");

const claudeAgent: BuilderDriver = {
  id: "claude-agent",
  external: false,
  async check() {
    if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.CLAUDE_CODE_OAUTH_TOKEN) return { ok: true };
    return { ok: false, reason: "set ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN / CLAUDE_CODE_OAUTH_TOKEN) for the claude-agent builder" };
  },
  async build({ run, variant, genre, packetText, log, emit, signal }) {
    const { query } = await import("@anthropic-ai/claude-agent-sdk");
    const abortController = new AbortController();
    signal.addEventListener("abort", () => abortController.abort(), { once: true });
    const budget = process.env.HARNESS_BUILDER_MAX_USD ? Number(process.env.HARNESS_BUILDER_MAX_USD) : undefined;
    const stream = query({
      prompt: packetText,
      options: {
        cwd: variant.dir,
        additionalDirectories: [HF_ROOT, runDir(run.id)],
        model: run.drivers.builderModel ?? process.env.HARNESS_CLAUDE_MODEL ?? "claude-opus-5-5",
        effort: (process.env.HARNESS_BUILDER_EFFORT as any) ?? "high",
        // Unattended: only pre-approved tools run, nothing ever prompts.
        permissionMode: "dontAsk",
        allowedTools: ["Read", "Write", "Edit", "MultiEdit", "Glob", "Grep", "Bash", "TodoWrite", "Task"],
        // Isolate from the host's user/project settings; the packet names every file to read.
        settingSources: [],
        systemPrompt: { type: "preset", preset: "claude_code", append: WORKER_SYSTEM_APPEND },
        maxTurns: buildBudget(variant.buildAttempts, genre).maxTurns,
        ...(budget ? { maxBudgetUsd: budget } : {}),
        abortController,
        stderr: (data: string) => log(`stderr: ${data.trim().slice(0, 300)}`),
      },
    });
    const trace = createTraceLog({
      dir: join(variant.dir, ".harness"),
      title: `${run.id} / ${variant.id}: build attempt ${variant.buildAttempts} (Claude Agent SDK)`,
      emit,
    });
    const names = new Map<string, string>();
    let turn = 0;
    for await (const message of stream as AsyncIterable<any>) {
      if (message.type === "assistant") {
        turn++;
        for (const block of message.message?.content ?? []) {
          if (block.type === "thinking" && block.thinking) trace({ kind: "thinking", turn, text: block.thinking });
          else if (block.type === "text" && block.text?.trim()) trace({ kind: "say", turn, text: block.text });
          else if (block.type === "tool_use") {
            names.set(block.id, block.name);
            trace({ kind: "tool_call", turn, id: block.id, name: block.name, args: block.input });
          }
        }
      } else if (message.type === "user") {
        for (const block of Array.isArray(message.message?.content) ? message.message.content : []) {
          if (block.type !== "tool_result") continue;
          const output = typeof block.content === "string" ? block.content : (block.content ?? []).map((c: any) => c.text ?? `[${c.type}]`).join("\n");
          trace({ kind: "tool_result", turn, id: block.tool_use_id, name: names.get(block.tool_use_id) ?? "tool", output, ms: 0 });
        }
      } else if (message.type === "result") {
        const usage = { prompt: message.usage?.input_tokens ?? 0, completion: message.usage?.output_tokens ?? 0 };
        const ok = message.subtype === "success" && !message.is_error;
        const detail = ok ? String(message.result ?? "") : `${message.subtype}: ${(message.errors ?? []).join("; ")}`;
        trace({ kind: "end", turn, status: ok ? "finished" : "failed", summary: detail, usage });
        return { status: ok ? "built" : "failed", detail: detail.slice(0, 2000), costUsd: message.total_cost_usd };
      }
    }
    return { status: "failed", detail: "agent stream ended without a result" };
  },
};

const num = (name: string, fallback: number) => Number(process.env[name] ?? fallback);

// Per-build limits. Repair rounds get half: they fix a list of findings, not a whole film.
// Env overrides win, then the genre's budget (a 10s motion graphic needs far less than a launch film).
export function buildBudget(attempt: number, genre?: Pick<Genre, "budget">) {
  const share = attempt > 1 ? 0.5 : 1;
  const g = genre?.budget;
  return {
    maxTurns: Math.max(8, Math.round(num("HARNESS_BUILDER_MAX_TURNS", g?.maxTurns ?? 40) * share)),
    budget: {
      maxInputTokens: Math.round(num("HARNESS_BUILDER_MAX_INPUT_TOKENS", g?.maxInputTokens ?? 600_000) * share),
      maxMinutes: num("HARNESS_BUILDER_MAX_MINUTES", g?.maxMinutes ?? 12) * share,
    },
  };
}

function hasRealEntry(dir: string): boolean {
  const p = join(dir, "index.html");
  if (!existsSync(p)) return false;
  const html = readFileSync(p, "utf8");
  return !(/>\s*Title\s*<\/h1>/i.test(html) && /\/\/\s*Example:\s*tl\.fromTo/.test(html));
}

// Any OpenAI-compatible provider (Z.ai GLM, Gemini, Qwen, ...) driven by the harness's own agent loop.
function llmBuilder(providerId: string): BuilderDriver {
  return {
    id: providerId,
    external: false,
    async check(model?: string) {
      return checkProvider(provider(providerId), "builder", model);
    },
    async build({ run, variant, genre, packetText, log, emit, signal }) {
      const p = provider(providerId);
      const model = modelFor(p, "builder", run.drivers.builderModel)!;
      const extraBody = requestExtras(p);
      const shell = bashPath() ? "bash (Git Bash on Windows)" : "the system shell (cmd.exe; bash is unavailable)";
      const trace = createTraceLog({
        dir: join(variant.dir, ".harness"),
        title: `${run.id} / ${variant.id}: build attempt ${variant.buildAttempts} (${p.label} ${model}${extraBody.reasoning_effort ? `, reasoning ${extraBody.reasoning_effort}` : ""})`,
        emit,
      });
      const result = await runAgent({
        client: clientFor(p),
        model,
        extraBody,
        system: [
          WORKER_SYSTEM_APPEND,
          `Tools: read_file, list_files, write_file, edit_file, run_command, finish, plus search_assets, use_asset, fetch_logo for the asset library. run_command uses ${shell}, with the project directory as cwd.`,
          "You have no sub-agent tool. Where a workflow dispatches sub-agents or frame workers, do that work yourself, one unit at a time, following the skill's no-delegation fallback.",
          "The task inlines the core references; do not re-read those. Read any other file a step needs before acting on it, and never reconstruct a skill from memory.",
          "Before each batch of tool calls, state your plan in one or two sentences. Verify each step from file contents or command output rather than assuming it worked.",
        ].join("\n"),
        prompt: packetText,
        cwd: variant.dir,
        readRoots: [HF_ROOT, runDir(run.id)],
        // Skills are readable; framework source is not. Builders that debug the gates burn budget.
        denyReadRoots: [join(HF_ROOT, "packages"), join(HF_ROOT, "node_modules"), join(HF_ROOT, "scripts")],
        ...buildBudget(variant.buildAttempts, genre),
        signal,
        // The trace carries every step; keep the plain log channel for nothing but the summary line.
        log: () => {},
        trace,
        extraTools: assetTools(variant.dir),
      });
      const usage = { ...result.usage, minutes: result.minutes ?? 0 };
      log(`${p.label} ${model}: ${result.turns} turns, ${result.usage.prompt} prompt + ${result.usage.completion} completion tokens, ${usage.minutes} min`);
      if (result.status === "finished") return { status: "built", detail: result.summary.slice(0, 2000), usage };
      // Out of budget: a real composition still goes to the gates and the judge rather than being wasted.
      if (result.status === "budget" && hasRealEntry(variant.dir)) {
        return { status: "built", detail: `stopped at budget with a usable index.html: ${result.summary}`, usage };
      }
      return { status: "failed", detail: result.summary.slice(0, 2000), usage };
    },
  };
}

export const BUILDERS: Record<string, BuilderDriver> = {
  external,
  "claude-agent": claudeAgent,
  ...Object.fromEntries(Object.keys(providers()).map((id) => [id, llmBuilder(id)])),
};

export function builderDriver(id: string): BuilderDriver {
  const d = BUILDERS[id];
  if (!d) throw Object.assign(new Error(`unknown builder "${id}"; expected ${Object.keys(BUILDERS).join(", ")}`), { status: 400 });
  return d;
}
