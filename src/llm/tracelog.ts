// Writes an agent's trace three ways:
//   agent-log.md     readable, live: open it in an editor while a build runs
//   agent-log.jsonl  complete and machine-readable (full thinking, args, outputs)
//   events           clipped copies on the run's event bus, for the dashboard and SSE
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TraceEntry } from "./agent.ts";

const MD_ARG_CHARS = 6000;
const MD_OUTPUT_CHARS = 4000;
const EVENT_TEXT_CHARS = 1500;

const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n)}\n…[${s.length - n} more chars in agent-log.jsonl]`);
const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const fence = (s: string) => {
  const ticks = s.includes("```") ? "````" : "```";
  return `${ticks}\n${s}\n${ticks}`;
};

export function describeCall(name: string, args: any): string {
  if (typeof args !== "object" || !args) return `${name} (unparseable arguments)`;
  switch (name) {
    case "write_file":
      return `write_file ${args.path} (${k(String(args.content ?? "").length)} chars)`;
    case "edit_file":
      return `edit_file ${args.path} (${k(String(args.old_string ?? "").length)} → ${k(String(args.new_string ?? "").length)} chars${args.replace_all ? ", all" : ""})`;
    case "run_command":
      return `run_command ${String(args.command).replace(/\s+/g, " ").slice(0, 300)}`;
    case "finish":
      return `finish: ${String(args.summary ?? "").slice(0, 300)}`;
    default:
      return `${name} ${args.path ?? ""}${args.contains ? ` (contains ${args.contains})` : ""}`;
  }
}

export interface TraceLogOptions {
  dir: string;
  title: string;
  emit: (type: string, message: string, data?: unknown) => void;
}

export function createTraceLog({ dir, title, emit }: TraceLogOptions) {
  mkdirSync(dir, { recursive: true });
  const md = join(dir, "agent-log.md");
  const jsonl = join(dir, "agent-log.jsonl");
  // Append, so repair rounds land under their own heading in the same log.
  if (!existsSync(md)) writeFileSync(md, "");
  appendFileSync(md, `\n# ${title}\n\nStarted ${new Date().toISOString()}\n`);
  const write = (text: string) => appendFileSync(md, text);

  return (entry: TraceEntry) => {
    appendFileSync(jsonl, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n");
    switch (entry.kind) {
      case "request":
        write(`\n## Turn ${entry.turn}\n\n_Request: ${entry.messages} messages, ${k(entry.contextChars)} chars of context._\n`);
        emit("agent.request", `turn ${entry.turn}: sending ${entry.messages} messages (${k(entry.contextChars)} chars)`);
        break;
      case "progress":
        emit(
          "agent.progress",
          `turn ${entry.turn}: ${Math.round(entry.elapsedMs / 1000)}s, thinking ${k(entry.reasoningChars)} · writing ${k(entry.contentChars + entry.toolArgChars)} chars`,
        );
        break;
      case "thinking":
        write(`\n### Thinking\n\n${entry.text.trim().split("\n").map((l) => `> ${l}`).join("\n")}\n`);
        emit("agent.thinking", clip(entry.text.trim(), EVENT_TEXT_CHARS));
        break;
      case "say":
        write(`\n### Plan / message\n\n${entry.text.trim()}\n`);
        emit("agent.say", clip(entry.text.trim(), EVENT_TEXT_CHARS));
        break;
      case "tool_call": {
        const summary = describeCall(entry.name, entry.args);
        const body = typeof entry.args === "string" ? entry.args : JSON.stringify(entry.args, null, 2);
        write(`\n### → ${summary}\n\n${fence(clip(body, MD_ARG_CHARS))}\n`);
        emit("agent.tool", summary, { name: entry.name });
        break;
      }
      case "tool_result":
        write(`\n**← ${entry.name}** (${entry.ms} ms)\n\n${fence(clip(entry.output, MD_OUTPUT_CHARS))}\n`);
        emit("agent.result", `${entry.name}: ${clip(entry.output.trim(), 400)}`);
        break;
      case "turn_done": {
        const u = entry.usage;
        const line = `turn ${entry.turn} done in ${(entry.ms / 1000).toFixed(1)}s: ${k(u.prompt)} in / ${k(u.completion)} out${u.reasoning != null ? ` (${k(u.reasoning)} thinking)` : ""}`;
        write(`\n_${line}, finish: ${entry.finishReason ?? "?"}_\n`);
        emit("agent.turn", line);
        break;
      }
      case "retry":
        write(`\n**Model call failed (attempt ${entry.attempt}):** ${entry.error}\n`);
        emit("agent.retry", `turn ${entry.turn} attempt ${entry.attempt}: ${entry.error}`);
        break;
      case "compacted":
        write(`\n_Context compacted: ${entry.elided} old tool outputs elided, now ${k(entry.contextChars)} chars._\n`);
        emit("agent.compacted", `elided ${entry.elided} old tool outputs; context now ${k(entry.contextChars)} chars`);
        break;
      case "end":
        write(`\n---\n\n**${entry.status.toUpperCase()}** after ${entry.turn} turns, ${k(entry.usage.prompt)} prompt + ${k(entry.usage.completion)} completion tokens.\n\n${entry.summary}\n`);
        emit("agent.end", `${entry.status} after ${entry.turn} turns, ${k(entry.usage.prompt)} in / ${k(entry.usage.completion)} out: ${clip(entry.summary, 300)}`);
        break;
    }
  };
}
