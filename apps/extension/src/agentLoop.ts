import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { EditorContext } from "./editorContext";
import {
  createOpenAIClient,
  resolveApplyLlmConfig,
  resolveLlmConfig,
  type ApplyLlmConfig,
  type LlmConfig,
} from "./llmConfig";
import { applyMergedEdit, parseCodeEdit } from "./editFile";

export type AgentLoopCallbacks = {
  onCodeEdit: (codeEdit: string) => void;
};

export type AgentLoopArgs = {
  messages: ChatCompletionMessageParam[];
  model?: string;
  llm?: Partial<LlmConfig>;
  applyLlm?: Partial<ApplyLlmConfig>;
  editorContext?: EditorContext | null;
} & AgentLoopCallbacks;

async function completeAssistantReply(
  openai: OpenAI,
  model: string,
  maxTokens: number,
  messages: ChatCompletionMessageParam[],
): Promise<string> {
  const response = await openai.chat.completions.create({
    model,
    messages,
    temperature: 0,
    max_tokens: maxTokens,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from model");
  }

  return content;
}

export async function agentLoop(args: AgentLoopArgs): Promise<string> {
  const {
    messages,
    model: modelOverride,
    llm: llmOverrides,
    applyLlm: applyLlmOverrides,
    editorContext,
    onCodeEdit,
  } = args;

  const llm = resolveLlmConfig(llmOverrides);
  const applyLlm = resolveApplyLlmConfig(applyLlmOverrides);
  const openai = createOpenAIClient(llm);
  const model = modelOverride ?? llm.model;
  const requestMessages: ChatCompletionMessageParam[] = messages;

  const text = await completeAssistantReply(
    openai,
    model,
    llm.maxTokens,
    requestMessages,
  );

  if (!editorContext) {
    return text;
  }

  const codeEdit = parseCodeEdit(text);
  if (!codeEdit) {
    throw new Error("Planner did not output a <code_edit> block");
  }

  onCodeEdit(codeEdit);

  const result = await applyMergedEdit(codeEdit, editorContext, applyLlm);
  if ("error" in result) {
    throw new Error(result.error);
  }

  return "done";
}
