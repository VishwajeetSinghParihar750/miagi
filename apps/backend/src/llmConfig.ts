import OpenAI from "openai";

export type LlmConfig = {
  baseURL: string;
  apiKey: string;
  model: string;
  maxTokens: number;
};

// --- Local llama.cpp (this PC) ---
// export const DEFAULT_LLM_BASE_URL = "http://127.0.0.1:8080/v1";
// export const DEFAULT_LLM_MODEL = "Qwen/Qwen2.5-Coder-3B-Instruct-GGUF:Q4_K_M";

// --- Ollama on other PC (same WiFi) ---
export const DEFAULT_LLM_BASE_URL = "http://192.168.0.104:11434/v1";
export const DEFAULT_LLM_MODEL = "qwen2.5-coder:7b";

export const DEFAULT_LLM_API_KEY = "dummy";
export const DEFAULT_LLM_MAX_TOKENS = 512;

function pickString(
  value: string | undefined,
  fallback: string,
): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function pickNumber(
  value: number | undefined,
  fallback: number,
): number {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

export function resolveLlmConfig(overrides?: Partial<LlmConfig>): LlmConfig {
  return {
    baseURL: pickString(
      overrides?.baseURL ?? process.env.LLM_BASE_URL,
      DEFAULT_LLM_BASE_URL,
    ),
    apiKey: pickString(
      overrides?.apiKey ?? process.env.LLM_API_KEY,
      DEFAULT_LLM_API_KEY,
    ),
    model: pickString(
      overrides?.model ?? process.env.LLM_MODEL,
      DEFAULT_LLM_MODEL,
    ),
    maxTokens: pickNumber(
      overrides?.maxTokens ??
        Number(process.env.LLM_MAX_TOKENS ?? DEFAULT_LLM_MAX_TOKENS),
      DEFAULT_LLM_MAX_TOKENS,
    ),
  };
}

export function createOpenAIClient(config: LlmConfig): OpenAI {
  return new OpenAI({
    baseURL: config.baseURL,
    apiKey: config.apiKey,
  });
}
