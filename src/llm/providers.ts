// OpenAI-compatible providers. Env names match the ones agent/ already uses (ZAI_*, GEMINI_*).
import OpenAI from "openai";

export interface Provider {
  id: string;
  label: string;
  keyEnv: string;
  baseURL: string;
  // Model for building (tool use) and for judging (must accept images).
  model: string | null;
  visionModel: string | null;
  // Extra request fields this provider understands.
  extraBody?: Record<string, unknown>;
}

const env = (name: string) => process.env[name]?.trim() || undefined;

export function providers(): Record<string, Provider> {
  return {
    zai: {
      id: "zai",
      label: "Z.ai GLM",
      keyEnv: "ZAI_API_KEY",
      baseURL: env("ZAI_BASE_URL") ?? "https://api.z.ai/api/paas/v4/",
      model: env("ZAI_MODEL") ?? "glm-5.3-flash",
      // GLM text models do not take images; the judge needs an explicit GLM vision model.
      visionModel: env("ZAI_VISION_MODEL") ?? null,
    },
    gemini: {
      id: "gemini",
      label: "Gemini",
      keyEnv: "GEMINI_API_KEY",
      baseURL: env("GEMINI_URL") ?? "https://generativelanguage.googleapis.com/v1beta/openai/",
      model: env("GEMINI_MODEL") ?? "gemini-3.1-flash-lite",
      visionModel: env("GEMINI_VISION_MODEL") ?? env("GEMINI_MODEL") ?? "gemini-3.1-flash-lite",
    },
    dashscope: {
      id: "dashscope",
      label: "DashScope (Qwen)",
      keyEnv: "DASHSCOPE_API_KEY",
      baseURL: env("DASHSCOPE_BASE_URL") ?? "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
      model: env("DASHSCOPE_MODEL") ?? null,
      visionModel: env("DASHSCOPE_VISION_MODEL") ?? null,
    },
    openai: {
      id: "openai",
      label: "OpenAI-compatible",
      keyEnv: "OPENAI_API_KEY",
      baseURL: env("OPENAI_BASE_URL") ?? "https://api.openai.com/v1",
      model: env("OPENAI_MODEL") ?? null,
      visionModel: env("OPENAI_VISION_MODEL") ?? env("OPENAI_MODEL") ?? null,
    },
  };
}

export function provider(id: string): Provider {
  const p = providers()[id];
  if (!p) throw Object.assign(new Error(`unknown provider "${id}"; expected ${Object.keys(providers()).join(", ")}`), { status: 400 });
  return p;
}

// Extra request fields per provider. Z.ai defaults to low reasoning effort, as agent/ does: GLM's
// default thinks for minutes per turn, which made builds crawl.
export function requestExtras(p: Provider): Record<string, unknown> {
  const effort = env(`${p.id.toUpperCase()}_REASONING_EFFORT`) ?? (p.id === "zai" ? "low" : undefined);
  return effort && effort !== "default" ? { reasoning_effort: effort } : {};
}

// Role overrides win over provider defaults, so one run can build on GLM and judge on Gemini.
export function modelFor(p: Provider, role: "builder" | "judge", override?: string): string | null {
  if (override) return override;
  if (role === "builder") return env("HARNESS_BUILDER_MODEL") ?? p.model;
  return env("HARNESS_JUDGE_MODEL") ?? p.visionModel;
}

export function checkProvider(p: Provider, role: "builder" | "judge", override?: string): { ok: boolean; reason?: string } {
  if (!env(p.keyEnv)) return { ok: false, reason: `set ${p.keyEnv} in harness/.env` };
  if (!modelFor(p, role, override)) {
    const v = role === "judge" ? `${p.id.toUpperCase()}_VISION_MODEL` : `${p.id.toUpperCase()}_MODEL`;
    return { ok: false, reason: `set ${v} (a ${role === "judge" ? "vision-capable " : ""}model id for ${p.label})` };
  }
  return { ok: true };
}

export function clientFor(p: Provider): OpenAI {
  return new OpenAI({
    apiKey: env(p.keyEnv),
    baseURL: p.baseURL,
    // Connection errors and 429/5xx only; slow generations are bounded by streamChat's timers.
    maxRetries: 3,
    timeout: 600_000,
  });
}
