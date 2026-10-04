// Streaming chat completions with live progress and hard time limits, so a slow model is visible
// and bounded instead of a silent multi-minute wait. Works with any OpenAI-compatible provider.
import type OpenAI from "openai";

export interface StreamProgress {
  elapsedMs: number;
  reasoningChars: number;
  contentChars: number;
  toolArgChars: number;
}

export interface StreamResult {
  content: string;
  reasoning: string;
  toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall[];
  finishReason: string | null;
  usage: { prompt: number; completion: number; reasoning?: number };
  ms: number;
}

export interface StreamLimits {
  signal?: AbortSignal;
  // Whole call, and the longest gap between two chunks.
  callTimeoutMs?: number;
  idleTimeoutMs?: number;
  onProgress?: (p: StreamProgress) => void;
  progressEveryMs?: number;
}

export class ModelTimeoutError extends Error {}

export async function streamChat(
  client: OpenAI,
  body: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming & Record<string, unknown>,
  limits: StreamLimits = {},
): Promise<StreamResult> {
  const started = Date.now();
  const callTimeoutMs = limits.callTimeoutMs ?? Number(process.env.HARNESS_MODEL_CALL_TIMEOUT_S ?? 240) * 1000;
  const idleTimeoutMs = limits.idleTimeoutMs ?? Number(process.env.HARNESS_MODEL_IDLE_TIMEOUT_S ?? 90) * 1000;
  const abort = new AbortController();
  let reason: string | null = null;
  const stop = (why: string) => {
    reason ??= why;
    abort.abort();
  };
  const onOuterAbort = () => stop("aborted");
  limits.signal?.addEventListener("abort", onOuterAbort, { once: true });
  const callTimer = setTimeout(() => stop(`model call exceeded ${Math.round(callTimeoutMs / 1000)}s`), callTimeoutMs);
  let idleTimer = setTimeout(() => stop(`no tokens for ${Math.round(idleTimeoutMs / 1000)}s`), idleTimeoutMs);

  let content = "";
  let reasoning = "";
  let finishReason: string | null = null;
  const usage: StreamResult["usage"] = { prompt: 0, completion: 0 };
  const calls: any[] = [];
  let lastProgress = started;
  const progress = () => ({
    elapsedMs: Date.now() - started,
    reasoningChars: reasoning.length,
    contentChars: content.length,
    toolArgChars: calls.reduce((a, c) => a + (c?.function?.arguments?.length ?? 0), 0),
  });

  try {
    const stream = await client.chat.completions.create({ ...body, stream: true, stream_options: { include_usage: true } } as any, { signal: abort.signal });
    for await (const chunk of stream as any as AsyncIterable<any>) {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => stop(`no tokens for ${Math.round(idleTimeoutMs / 1000)}s`), idleTimeoutMs);
      if (chunk.usage) {
        usage.prompt = chunk.usage.prompt_tokens ?? usage.prompt;
        usage.completion = chunk.usage.completion_tokens ?? usage.completion;
        const r = chunk.usage.completion_tokens_details?.reasoning_tokens;
        if (r != null) usage.reasoning = r;
      }
      const choice = chunk.choices?.[0];
      if (!choice) continue;
      if (choice.finish_reason) finishReason = choice.finish_reason;
      const d = choice.delta ?? {};
      if (d.content) content += d.content;
      // GLM streams its chain of thought as reasoning_content; some providers call it reasoning.
      const r = d.reasoning_content ?? d.reasoning;
      if (typeof r === "string") reasoning += r;
      for (const tc of d.tool_calls ?? []) {
        const i = tc.index ?? calls.length;
        const cur = (calls[i] ??= { id: "", type: "function", function: { name: "", arguments: "" } });
        if (tc.id) cur.id = tc.id;
        const name = tc.function?.name;
        if (name && name !== cur.function.name) cur.function.name = cur.function.name ? cur.function.name + name : name;
        if (tc.function?.arguments) cur.function.arguments += tc.function.arguments;
        // Keep provider extras (Gemini 3 thought signatures ride on extra_content).
        for (const [k, v] of Object.entries(tc)) if (!["index", "id", "type", "function"].includes(k) && v != null) cur[k] = v;
      }
      if (limits.onProgress && Date.now() - lastProgress >= (limits.progressEveryMs ?? 5000)) {
        lastProgress = Date.now();
        limits.onProgress(progress());
      }
    }
  } catch (e) {
    if (reason && reason !== "aborted") throw new ModelTimeoutError(`${reason} (${progress().reasoningChars} thinking chars, ${progress().contentChars + progress().toolArgChars} output chars so far)`);
    throw e;
  } finally {
    clearTimeout(callTimer);
    clearTimeout(idleTimer);
    limits.signal?.removeEventListener("abort", onOuterAbort);
  }
  if (reason && reason !== "aborted") throw new ModelTimeoutError(reason);
  return { content, reasoning, toolCalls: calls.filter(Boolean), finishReason, usage, ms: Date.now() - started };
}
