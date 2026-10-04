// A provider-agnostic coding-agent loop over OpenAI-compatible chat completions + tool calls.
// It is what lets GLM (Z.ai), Gemini, or Qwen execute a HyperFrames workflow inside one variant
// directory. Not a sandbox: commands run with the server's permissions, scoped by cwd and a denylist.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type OpenAI from "openai";
import { killTree } from "../hf.ts";
import { streamChat, type StreamResult } from "./stream.ts";
import type { ExtraTool } from "../assets/tools.ts";

type Message = OpenAI.Chat.Completions.ChatCompletionMessageParam;

// Everything the agent does, in order. The builder driver writes these to agent-log.md/.jsonl and
// streams them to the dashboard.
export type TraceEntry =
  | { kind: "request"; turn: number; messages: number; contextChars: number }
  | { kind: "progress"; turn: number; elapsedMs: number; reasoningChars: number; contentChars: number; toolArgChars: number }
  | { kind: "thinking"; turn: number; text: string }
  | { kind: "say"; turn: number; text: string }
  | { kind: "tool_call"; turn: number; id: string; name: string; args: any }
  | { kind: "tool_result"; turn: number; id: string; name: string; output: string; ms: number }
  | { kind: "turn_done"; turn: number; ms: number; usage: { prompt: number; completion: number; reasoning?: number }; finishReason: string | null }
  | { kind: "retry"; turn: number; attempt: number; error: string }
  | { kind: "compacted"; turn: number; elided: number; contextChars: number }
  | { kind: "end"; turn: number; status: AgentResult["status"]; summary: string; usage: AgentResult["usage"] };

export interface AgentOptions {
  client: OpenAI;
  model: string;
  system: string;
  prompt: string;
  cwd: string;
  readRoots: string[];
  maxTurns: number;
  signal: AbortSignal;
  log: (message: string) => void;
  trace?: (entry: TraceEntry) => void;
  // Provider-specific request fields, e.g. reasoning_effort.
  extraBody?: Record<string, unknown>;
  // Domain tools beyond the file/shell basics (e.g. the asset library).
  extraTools?: ExtraTool[];
  // Hard spend limits for one build. At WRAP_UP_AT of any limit the agent is told to finish;
  // at the limit it is stopped.
  budget?: { maxInputTokens?: number; maxMinutes?: number };
  // Paths the agent may not read even inside readRoots (e.g. framework source code).
  denyReadRoots?: string[];
}

export interface AgentResult {
  status: "finished" | "stopped" | "failed" | "budget";
  summary: string;
  turns: number;
  usage: { prompt: number; completion: number };
  minutes?: number;
}

const MAX_TOOL_OUTPUT = 16_000;
const CONTEXT_CHARS = Number(process.env.HARNESS_AGENT_CONTEXT_CHARS ?? 150_000);
const CALL_ATTEMPTS = 3;
const KEEP_RECENT_TOOL_RESULTS = 8;
const WRAP_UP_AT = 0.8;

// Commands that would break the run's contract or reach outside it.
const DENY: [RegExp, string][] = [
  [/\bhyperframes(@[\w.]+)?\s+render\b/, "render is gated by the harness; stop before render"],
  [/\bhyperframes(@[\w.]+)?\s+(preview|present|publish)\b/, "preview/publish block or publish; the harness gates and judges instead"],
  [/\bskills\s+update\b/, "skills are vendored and pinned for the run"],
  [/\bgit\s+(push|commit|reset|clean|checkout)\b/, "no git operations inside a variant"],
  [/\brm\s+-[a-z]*r[a-z]*f?\s+(\/|~|\.\.|[A-Za-z]:)/i, "recursive delete outside the variant"],
  [/\b(rd|rmdir)\s+\/s\b|\bdel\s+\/s\b|\bformat\s+[A-Za-z]:/i, "recursive delete"],
  [/\bnpm\s+publish\b|\bcurl\b[^|]*\|\s*(ba)?sh\b/, "publishing or piping remote scripts"],
  // Installing image tools to crop or convert a logo is the classic budget sink; assets are used as-is.
  [/\b(npm|pnpm|yarn|bun)\s+(install|i|add)\b|\bpip3?\s+install\b/, "installing packages: use assets as-is (the packet's brand kit already resolved fonts and logos)"],
];

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  fn("read_file", "Read a text file. Paths may be absolute or relative to the project directory. Returns numbered lines.", {
    path: { type: "string" },
    offset: { type: "integer", description: "1-based first line (default 1)" },
    limit: { type: "integer", description: "max lines (default 1200)" },
  }, ["path"]),
  fn("list_files", "List files under a directory recursively (skips node_modules and .git).", {
    path: { type: "string" },
    contains: { type: "string", description: "only paths containing this substring" },
  }, ["path"]),
  fn("write_file", "Create or overwrite a file inside the project directory.", { path: { type: "string" }, content: { type: "string" } }, ["path", "content"]),
  fn("edit_file", "Replace an exact string in a file inside the project directory. old_string must match exactly and be unique unless replace_all is true.", {
    path: { type: "string" },
    old_string: { type: "string" },
    new_string: { type: "string" },
    replace_all: { type: "boolean" },
  }, ["path", "old_string", "new_string"]),
  fn("run_command", "Run a shell command in the project directory and return its combined output and exit code.", {
    command: { type: "string" },
    timeout_seconds: { type: "integer", description: "default 600, max 1800" },
  }, ["command"]),
  fn("finish", "Call once the variant is built, gated, and NOTES.md is written. Ends the session.", { summary: { type: "string" } }, ["summary"]),
];

function fn(name: string, description: string, properties: Record<string, unknown>, required: string[]): OpenAI.Chat.Completions.ChatCompletionTool {
  return { type: "function", function: { name, description, parameters: { type: "object", properties, required, additionalProperties: false } } };
}

const inside = (root: string, target: string) => {
  const rel = relative(resolve(root), resolve(target));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};

let cachedBash: string | null | undefined;

// Workflows give bash commands. On Windows, find Git Bash: HARNESS_BASH, the default install, or
// next to whichever git.exe is on PATH (Git is often installed somewhere else, e.g. D:\...\Git).
export function bashPath(): string | null {
  if (process.platform !== "win32") return "bash";
  if (cachedBash !== undefined) return cachedBash;
  const candidates = [process.env.HARNESS_BASH, "C:\\Program Files\\Git\\bin\\bash.exe", "C:\\Program Files\\Git\\usr\\bin\\bash.exe"];
  for (const dir of (process.env.PATH ?? "").split(";").filter(Boolean)) {
    if (existsSync(join(dir, "git.exe"))) candidates.push(join(dir, "..", "bin", "bash.exe"), join(dir, "..", "usr", "bin", "bash.exe"));
  }
  return (cachedBash = candidates.find((p) => p && existsSync(p)) ?? null);
}

function runShell(command: string, cwd: string, timeoutMs: number, signal: AbortSignal): Promise<{ code: number | null; output: string; timedOut: boolean }> {
  const bash = bashPath();
  return new Promise((done) => {
    const child = bash
      ? spawn(bash, ["-c", command], { cwd, windowsHide: true, env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" } })
      : spawn(command, { cwd, shell: true, windowsHide: true, env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" } });
    let output = "";
    let timedOut = false;
    child.stdout.on("data", (c) => (output += c));
    child.stderr.on("data", (c) => (output += c));
    const stop = () => killTree(child.pid);
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, timeoutMs);
    signal.addEventListener("abort", stop, { once: true });
    child.on("close", (code) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", stop);
      done({ code, output, timedOut });
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      done({ code: -1, output: output + String(e), timedOut });
    });
  });
}

const clip = (s: string) => (s.length <= MAX_TOOL_OUTPUT ? s : `${s.slice(0, MAX_TOOL_OUTPUT / 2)}\n…[${s.length - MAX_TOOL_OUTPUT} chars truncated]…\n${s.slice(-MAX_TOOL_OUTPUT / 2)}`);

async function runTool(name: string, args: any, opts: AgentOptions): Promise<{ output: string; finish?: string }> {
  const abs = (p: string) => (isAbsolute(p) ? p : resolve(opts.cwd, p));
  const readable = (p: string) =>
    [opts.cwd, ...opts.readRoots].some((r) => inside(r, p)) && !(opts.denyReadRoots ?? []).some((r) => inside(r, p));
  const writable = (p: string) => inside(opts.cwd, p);
  switch (name) {
    case "read_file": {
      const p = abs(args.path);
      if (!readable(p)) return { output: `error: ${p} is outside the readable roots (skills, your project, and the run are readable; framework source code is not: build with what the skills say, and leave debugging the gates to the harness)` };
      if (!existsSync(p) || statSync(p).isDirectory()) return { output: `error: no such file ${p}` };
      const lines = readFileSync(p, "utf8").split(/\r?\n/);
      const start = Math.max(1, args.offset ?? 1);
      const end = Math.min(lines.length, start - 1 + (args.limit ?? 1200));
      const body = lines.slice(start - 1, end).map((l, i) => `${start + i}\t${l}`).join("\n");
      return { output: clip(`${body}${end < lines.length ? `\n…(${lines.length - end} more lines; read with offset=${end + 1})` : ""}`) };
    }
    case "list_files": {
      const p = abs(args.path);
      if (!readable(p)) return { output: `error: ${p} is outside the readable roots (skills, your project, and the run are readable; framework source code is not: build with what the skills say, and leave debugging the gates to the harness)` };
      if (!existsSync(p)) return { output: `error: no such directory ${p}` };
      const out: string[] = [];
      const walk = (d: string) => {
        for (const n of readdirSync(d)) {
          if (out.length >= 500 || n === "node_modules" || n === ".git") continue;
          const q = join(d, n);
          if (statSync(q).isDirectory()) walk(q);
          else if (!args.contains || q.includes(args.contains)) out.push(relative(p, q).split("\\").join("/"));
        }
      };
      walk(p);
      return { output: out.join("\n") + (out.length >= 500 ? "\n…(truncated at 500)" : "") || "(empty)" };
    }
    case "write_file": {
      const p = abs(args.path);
      if (!writable(p)) return { output: `error: writes are limited to ${opts.cwd}` };
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, args.content ?? "");
      return { output: `wrote ${relative(opts.cwd, p)} (${(args.content ?? "").length} chars)` };
    }
    case "edit_file": {
      const p = abs(args.path);
      if (!writable(p)) return { output: `error: edits are limited to ${opts.cwd}` };
      if (!existsSync(p)) return { output: `error: no such file ${p}` };
      const text = readFileSync(p, "utf8");
      const count = text.split(args.old_string).length - 1;
      if (count === 0) return { output: "error: old_string not found; read the file and copy the text exactly" };
      if (count > 1 && !args.replace_all) return { output: `error: old_string matches ${count} times; add context or set replace_all` };
      writeFileSync(p, args.replace_all ? text.split(args.old_string).join(args.new_string) : text.replace(args.old_string, () => args.new_string));
      return { output: `edited ${relative(opts.cwd, p)} (${args.replace_all ? count : 1} replacement${count > 1 && args.replace_all ? "s" : ""})` };
    }
    case "run_command": {
      const command = String(args.command ?? "");
      const denied = DENY.find(([re]) => re.test(command));
      if (denied) return { output: `refused: ${denied[1]}` };
      const timeout = Math.min(Math.max(Number(args.timeout_seconds ?? 600), 5), 1800) * 1000;
      const r = await runShell(command, opts.cwd, timeout, opts.signal);
      return { output: clip(`exit ${r.code}${r.timedOut ? " (timed out)" : ""}\n${r.output}`) };
    }
    case "finish":
      return { output: "ok", finish: String(args.summary ?? "") };
    default: {
      const extra = opts.extraTools?.find((t) => t.tool.type === "function" && t.tool.function.name === name);
      if (!extra) return { output: `error: unknown tool ${name}` };
      try {
        return { output: clip(await extra.run(args)) };
      } catch (e) {
        return { output: `error: ${(e as Error).message}` };
      }
    }
  }
}

const contextSize = (messages: Message[]) => messages.reduce((a, m) => a + JSON.stringify(m).length, 0);

// Old tool results are the bulk of context; elide the oldest once the transcript gets large.
// Every turn resends the whole transcript, so this also bounds per-call latency and cost.
function compact(messages: Message[]): number {
  if (contextSize(messages) <= CONTEXT_CHARS) return 0;
  let elided = 0;
  const toolIdx = messages.map((m, i) => (m.role === "tool" ? i : -1)).filter((i) => i >= 0);
  for (const i of toolIdx.slice(0, Math.max(0, toolIdx.length - KEEP_RECENT_TOOL_RESULTS))) {
    const m = messages[i] as OpenAI.Chat.Completions.ChatCompletionToolMessageParam;
    if (typeof m.content === "string" && m.content.length > 200) {
      m.content = "[older output elided to save context; rerun the tool if you need it]";
      elided++;
    }
    if (contextSize(messages) <= CONTEXT_CHARS * 0.8) break;
  }
  return elided;
}

export async function runAgent(opts: AgentOptions): Promise<AgentResult> {
  const trace = opts.trace ?? (() => {});
  const messages: Message[] = [
    { role: "system", content: opts.system },
    { role: "user", content: opts.prompt },
  ];
  const usage = { prompt: 0, completion: 0 };
  const started = Date.now();
  const minutes = () => Math.round(((Date.now() - started) / 60000) * 10) / 10;
  const end = (status: AgentResult["status"], summary: string, turns: number): AgentResult => {
    trace({ kind: "end", turn: turns, status, summary, usage });
    return { status, summary, turns, usage, minutes: minutes() };
  };
  // The largest share of any limit spent so far: turns, input tokens, or wall-clock minutes.
  const spent = (turn: number) =>
    Math.max(
      turn / opts.maxTurns,
      opts.budget?.maxInputTokens ? usage.prompt / opts.budget.maxInputTokens : 0,
      opts.budget?.maxMinutes ? minutes() / opts.budget.maxMinutes : 0,
    );
  let warned = false;
  let nudges = 0;
  for (let turn = 1; turn <= opts.maxTurns; turn++) {
    if (opts.signal.aborted) return end("stopped", "aborted", turn);
    const share = spent(turn);
    if (share >= 1 && turn > 1) {
      return end("budget", `budget spent after ${turn - 1} turns, ${usage.prompt} input tokens, ${minutes()} min`, turn - 1);
    }
    if (share >= WRAP_UP_AT && !warned) {
      warned = true;
      const msg =
        `Budget: ${Math.round(share * 100)}% of this build's budget is spent (${turn - 1} turns, ${Math.round(usage.prompt / 1000)}k input tokens, ${minutes()} min). ` +
        "Wrap up now: make sure index.html is your complete film, run the harness gate once, fix only hard failures, write NOTES.md, then call finish. Skip warnings and polish.";
      messages.push({ role: "user", content: msg });
      trace({ kind: "say", turn, text: `[harness] ${msg}` });
    }
    const elided = compact(messages);
    if (elided) trace({ kind: "compacted", turn, elided, contextChars: contextSize(messages) });
    trace({ kind: "request", turn, messages: messages.length, contextChars: contextSize(messages) });

    let res: StreamResult | null = null;
    for (let attempt = 1; attempt <= CALL_ATTEMPTS && !res; attempt++) {
      try {
        res = await streamChat(
          opts.client,
          { model: opts.model, messages, tools: [...TOOLS, ...(opts.extraTools ?? []).map((t) => t.tool)], tool_choice: "auto", ...(opts.extraBody ?? {}) },
          { signal: opts.signal, onProgress: (p) => trace({ kind: "progress", turn, ...p }) },
        );
      } catch (e) {
        if (opts.signal.aborted) return end("stopped", "aborted", turn);
        const error = (e as Error).message;
        trace({ kind: "retry", turn, attempt, error });
        opts.log(`model call failed (attempt ${attempt}/${CALL_ATTEMPTS}): ${error}`);
        if (attempt === CALL_ATTEMPTS) return end("failed", `model call failed on turn ${turn}: ${error}`, turn);
      }
    }
    if (!res) return end("failed", `no response on turn ${turn}`, turn);
    usage.prompt += res.usage.prompt;
    usage.completion += res.usage.completion;
    if (res.reasoning.trim()) trace({ kind: "thinking", turn, text: res.reasoning });
    if (res.content.trim()) {
      trace({ kind: "say", turn, text: res.content });
      opts.log(`says: ${res.content.trim().replace(/\s+/g, " ").slice(0, 200)}`);
    }
    trace({ kind: "turn_done", turn, ms: res.ms, usage: res.usage, finishReason: res.finishReason });

    const calls = res.toolCalls;
    // Echo tool calls back as returned: Gemini 3 carries thought signatures in them.
    calls.forEach((c, i) => (c.id ||= `call_${turn}_${i}`));
    messages.push({ role: "assistant", content: res.content, ...(calls.length ? { tool_calls: calls } : {}) } as Message);

    if (!calls.length) {
      if (nudges++ < 2) {
        messages.push({ role: "user", content: "Continue working with the tools. When the variant is built, self-gated, and NOTES.md is written, call finish." });
        continue;
      }
      return end("finished", res.content, turn);
    }
    nudges = 0;
    for (const call of calls) {
      let args: any = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        const output = "error: arguments were not valid JSON; call the tool again";
        trace({ kind: "tool_call", turn, id: call.id, name: call.function.name, args: call.function.arguments });
        trace({ kind: "tool_result", turn, id: call.id, name: call.function.name, output, ms: 0 });
        messages.push({ role: "tool", tool_call_id: call.id, content: output });
        continue;
      }
      trace({ kind: "tool_call", turn, id: call.id, name: call.function.name, args });
      opts.log(`${call.function.name} ${String(args.command ?? args.path ?? "").replace(/\s+/g, " ").slice(0, 160)}`);
      const t0 = Date.now();
      const out = await runTool(call.function.name, args, opts);
      trace({ kind: "tool_result", turn, id: call.id, name: call.function.name, output: out.output, ms: Date.now() - t0 });
      messages.push({ role: "tool", tool_call_id: call.id, content: out.output });
      if (out.finish !== undefined) return end("finished", out.finish, turn);
    }
  }
  return end("budget", `hit the ${opts.maxTurns}-turn limit`, opts.maxTurns);
}
