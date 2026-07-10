import OpenAI from "openai";

export type LlmConfig = {
  baseURL: string;
  apiKey: string;
  model: string;
  maxTokens: number;
};

export const DEFAULT_LLM_BASE_URL = "http://127.0.0.1:8080/v1";
export const DEFAULT_LLM_API_KEY = "dummy";
export const DEFAULT_LLM_MODEL = "Qwen/Qwen2.5-Coder-3B-Instruct-GGUF:Q4_K_M";
export const DEFAULT_LLM_MAX_TOKENS = 512;

export function resolveLlmConfig(overrides?: Partial<LlmConfig>): LlmConfig {
  return {
    baseURL:
      overrides?.baseURL ??
      process.env.LLM_BASE_URL ??
      DEFAULT_LLM_BASE_URL,
    apiKey:
      overrides?.apiKey ?? process.env.LLM_API_KEY ?? DEFAULT_LLM_API_KEY,
    model: overrides?.model ?? process.env.LLM_MODEL ?? DEFAULT_LLM_MODEL,
    maxTokens:
      overrides?.maxTokens ??
      Number(process.env.LLM_MAX_TOKENS ?? DEFAULT_LLM_MAX_TOKENS),
  };
}

export function createOpenAIClient(config: LlmConfig): OpenAI {
  return new OpenAI({
    baseURL: config.baseURL,
    apiKey: config.apiKey,
  });
}
