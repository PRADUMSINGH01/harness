// Judge drivers: who scores the proof frames. Judges never see seeds, gate scores, or build notes.
//   external      publish the packet; scorecards arrive via POST /runs/:id/scorecards
//   zai, gemini,  any OpenAI-compatible vision model over the compare sheets, contact sheets
//   dashscope,    and frames (keys and models from harness/.env)
//   openai
//   claude-agent  a read-only Claude Agent SDK session that opens the images itself
import { readFileSync, statSync } from "node:fs";
import type { Genre } from "../types.ts";
import type { JudgeMaterials } from "../runs/packets.ts";
import { runDir, type RunState } from "../runs/store.ts";
import { parseJsonOut } from "../hf.ts";
import { checkProvider, clientFor, modelFor, provider, providers, requestExtras } from "../llm/providers.ts";
import { streamChat } from "../llm/stream.ts";
import { createTraceLog } from "../llm/tracelog.ts";
import { join } from "node:path";

export interface JudgeContext {
  run: RunState;
  genre: Genre;
  judgeId: string;
  materials: JudgeMaterials;
  // Set on a retry after the previous answer failed validation.
  correction?: string;
  log: (message: string) => void;
  emit: (type: string, message: string, data?: unknown) => void;
}

export type JudgeOutcome = { status: "done"; cards: any[] } | { status: "waiting" } | { status: "failed"; detail: string };

export interface JudgeDriver {
  id: string;
  external: boolean;
  check(model?: string): Promise<{ ok: boolean; reason?: string }>;
  judge(ctx: JudgeContext): Promise<JudgeOutcome>;
}

const external: JudgeDriver = {
  id: "external",
  external: true,
  async check() {
    return { ok: true };
  },
  async judge() {
    return { status: "waiting" };
  },
};

const MAX_INLINE_BYTES = Number(process.env.HARNESS_JUDGE_MAX_BYTES ?? 10 * 1024 * 1024);
const MAX_IMAGES = Number(process.env.HARNESS_JUDGE_MAX_IMAGES ?? 20);
const JUDGE_CALL_ATTEMPTS = 3;

// Side-by-side sheets first (the comparison is the point), then contact sheets, then single frames,
// within the provider's inline-image budget.
export function pickImages(images: JudgeMaterials["images"]) {
  const order = (caption: string) => (caption.includes("side by side") ? 0 : caption.includes("contact sheet") ? 1 : 2);
  const picked: (JudgeMaterials["images"][number] & { bytes: number })[] = [];
  let bytes = 0;
  for (const img of [...images].sort((a, b) => order(a.caption) - order(b.caption))) {
    const size = statSync(img.path).size;
    if (picked.length >= MAX_IMAGES || bytes + size > MAX_INLINE_BYTES) continue;
    bytes += size;
    picked.push({ ...img, bytes: size });
  }
  return { picked, bytes };
}

const asCards = (value: any) => (Array.isArray(value) ? value : Array.isArray(value?.scorecards) ? value.scorecards : null);

// Vision judge for any OpenAI-compatible provider (Gemini, GLM vision, Qwen-VL, ...).
function llmJudge(providerId: string): JudgeDriver {
  return {
    id: providerId,
    external: false,
    async check(model?: string) {
      return checkProvider(provider(providerId), "judge", model);
    },
    async judge({ run, judgeId, materials, correction, log, emit }) {
      const p = provider(providerId);
      const model = modelFor(p, "judge", run.drivers.judgeModel)!;
      const { picked, bytes } = pickImages(materials.images);
      const content: any[] = [
        {
          type: "text",
          text:
            materials.text +
            "\n\nThe images are attached below in the order listed, each preceded by its caption. Judge only from them." +
            (correction ? `\n\n## Your previous answer was rejected\n\n${correction}\n\nReturn the full corrected JSON array.` : ""),
        },
      ];
      for (const img of picked) {
        const mime = img.path.toLowerCase().endsWith(".jpg") ? "image/jpeg" : "image/png";
        content.push({ type: "text", text: img.caption });
        content.push({ type: "image_url", image_url: { url: `data:${mime};base64,${readFileSync(img.path).toString("base64")}` } });
      }
      log(`${p.label} ${model}: ${picked.length}/${materials.images.length} images, ${(bytes / 1e6).toFixed(1)} MB`);
      const extraBody = requestExtras(p);
      const trace = createTraceLog({
        dir: join(runDir(run.id), "judge", judgeId),
        title: `${run.id}: judge ${judgeId} (${p.label} ${model}), ${picked.length} images${correction ? ", retry after rejected scorecards" : ""}`,
        emit: (type, message, data) => emit(type.replace(/^agent\./, "judge."), `${judgeId} ${message}`, data),
      });
      trace({ kind: "request", turn: 1, messages: 1, contextChars: String(content[0].text).length });
      try {
        // A dropped stream ("terminated", a reset, an idle timeout) is retried, as builder turns are.
        let res: Awaited<ReturnType<typeof streamChat>> | null = null;
        for (let attempt = 1; !res; attempt++) {
          try {
            res = await streamChat(clientFor(p), { model, messages: [{ role: "user", content }], ...extraBody }, { onProgress: (pr) => trace({ kind: "progress", turn: 1, ...pr }) });
          } catch (e) {
            if (attempt >= JUDGE_CALL_ATTEMPTS) throw e;
            trace({ kind: "retry", turn: 1, attempt, error: (e as Error).message });
          }
        }
        if (res.reasoning.trim()) trace({ kind: "thinking", turn: 1, text: res.reasoning });
        trace({ kind: "say", turn: 1, text: res.content });
        trace({ kind: "turn_done", turn: 1, ms: res.ms, usage: res.usage, finishReason: res.finishReason });
        const cards = asCards(parseJsonOut(res.content));
        trace({ kind: "end", turn: 1, status: cards ? "finished" : "failed", summary: cards ? `${cards.length} scorecards` : "no JSON array in the answer", usage: res.usage });
        return cards ? { status: "done", cards } : { status: "failed", detail: `${p.label} returned no JSON array: ${res.content.slice(0, 300)}` };
      } catch (e) {
        trace({ kind: "end", turn: 1, status: "failed", summary: (e as Error).message, usage: { prompt: 0, completion: 0 } });
        return { status: "failed", detail: (e as Error).message };
      }
    },
  };
}

const claudeAgent: JudgeDriver = {
  id: "claude-agent",
  external: false,
  async check() {
    if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.CLAUDE_CODE_OAUTH_TOKEN) return { ok: true };
    return { ok: false, reason: "set ANTHROPIC_API_KEY for the claude-agent judge" };
  },
  async judge({ run, materials, correction, log }) {
    const { query } = await import("@anthropic-ai/claude-agent-sdk");
    const prompt =
      materials.text +
      "\n\nOpen every image listed under Materials with the Read tool before scoring. Your final message must be the JSON array and nothing else." +
      (correction ? `\n\n## Your previous answer was rejected\n\n${correction}` : "");
    const stream = query({
      prompt,
      options: {
        cwd: runDir(run.id),
        additionalDirectories: run.variants.map((v) => v.dir),
        model: run.drivers.judgeModel ?? process.env.HARNESS_JUDGE_CLAUDE_MODEL ?? "claude-opus-5-5",
        effort: "high",
        permissionMode: "dontAsk",
        allowedTools: ["Read", "Glob"],
        settingSources: [],
        maxTurns: 120,
      },
    });
    for await (const message of stream as AsyncIterable<any>) {
      if (message.type === "result") {
        if (message.subtype !== "success" || message.is_error) return { status: "failed", detail: `${message.subtype}: ${(message.errors ?? []).join("; ")}` };
        const cards = parseJsonOut(String(message.result ?? ""));
        log(`claude judge cost $${message.total_cost_usd?.toFixed?.(2) ?? "?"}`);
        return Array.isArray(cards) ? { status: "done", cards } : { status: "failed", detail: "judge did not return a JSON array" };
      }
    }
    return { status: "failed", detail: "judge stream ended without a result" };
  },
};

export const JUDGES: Record<string, JudgeDriver> = {
  external,
  "claude-agent": claudeAgent,
  ...Object.fromEntries(Object.keys(providers()).map((id) => [id, llmJudge(id)])),
};

export function judgeDriver(id: string): JudgeDriver {
  const d = JUDGES[id];
  if (!d) throw Object.assign(new Error(`unknown judge "${id}"; expected ${Object.keys(JUDGES).join(", ")}`), { status: 400 });
  return d;
}
