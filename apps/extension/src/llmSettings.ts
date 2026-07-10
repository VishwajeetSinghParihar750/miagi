import * as vscode from "vscode";
import type { LlmConfig } from "../../backend/src/llmConfig";

export function getLlmConfigFromSettings(): Partial<LlmConfig> {
  const config = vscode.workspace.getConfiguration("miagi");

  return {
    baseURL: config.get<string>("llmBaseUrl"),
    apiKey: config.get<string>("llmApiKey"),
    model: config.get<string>("llmModel"),
    maxTokens: config.get<number>("llmMaxTokens"),
  };
}
