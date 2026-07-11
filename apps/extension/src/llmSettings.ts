import * as vscode from "vscode";
import {
  DEFAULT_APPLY_LLM_API_KEY,
  DEFAULT_APPLY_LLM_BASE_URL,
  DEFAULT_APPLY_LLM_MAX_TOKENS,
  DEFAULT_APPLY_LLM_MODEL,
  DEFAULT_LLM_API_KEY,
  DEFAULT_LLM_BASE_URL,
  DEFAULT_LLM_MAX_TOKENS,
  DEFAULT_LLM_MODEL,
  resolveApplyLlmConfig,
  resolveLlmConfig,
  type ApplyLlmConfig,
  type LlmConfig,
} from "./llmConfig";

function pickString(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function pickNumber(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

export function getLlmConfigFromSettings(): Partial<LlmConfig> {
  const config = vscode.workspace.getConfiguration("miagi");

  return {
    baseURL: pickString(config.get<string>("llmBaseUrl"), DEFAULT_LLM_BASE_URL),
    apiKey: pickString(config.get<string>("llmApiKey"), DEFAULT_LLM_API_KEY),
    model: pickString(config.get<string>("llmModel"), DEFAULT_LLM_MODEL),
    maxTokens: pickNumber(
      config.get<number>("llmMaxTokens"),
      DEFAULT_LLM_MAX_TOKENS,
    ),
  };
}

export function getApplyLlmConfigFromSettings(): Partial<ApplyLlmConfig> {
  const config = vscode.workspace.getConfiguration("miagi");

  return {
    baseURL: pickString(
      config.get<string>("applyLlmBaseUrl"),
      DEFAULT_APPLY_LLM_BASE_URL,
    ),
    apiKey: pickString(
      config.get<string>("applyLlmApiKey"),
      DEFAULT_APPLY_LLM_API_KEY,
    ),
    model: pickString(
      config.get<string>("applyLlmModel"),
      DEFAULT_APPLY_LLM_MODEL,
    ),
    maxTokens: pickNumber(
      config.get<number>("applyLlmMaxTokens"),
      DEFAULT_APPLY_LLM_MAX_TOKENS,
    ),
  };
}

export function getResolvedLlmConfig() {
  return resolveLlmConfig(getLlmConfigFromSettings());
}

export function getResolvedApplyLlmConfig() {
  return resolveApplyLlmConfig(getApplyLlmConfigFromSettings());
}
