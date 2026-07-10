import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import type { EditorContext } from "./editorContext";
import {
  createOpenAIClient,
  resolveLlmConfig,
  type LlmConfig,
} from "./llmConfig";
import { editToolDefinitions, editToolHandlers } from "./tools/editFile";

const tools = editToolDefinitions;
const knownToolNames = new Set(tools.map((tool) => tool.function.name));

export type AgentLoopCallbacks = {
  onAssistantReply?: (text: string) => void;
  onToolCall?: (name: string, args: Record<string, unknown>) => void;
};

export type AgentLoopArgs = {
  systemInstruction: string;
  messages: ChatCompletionMessageParam[];
  model?: string;
  enableTools?: boolean;
  llm?: Partial<LlmConfig>;
  editorContext?: EditorContext | null;
} & AgentLoopCallbacks;

function parseToolCallPayload(
  payload: unknown,
): { name: string; arguments: Record<string, unknown> } | undefined {
  if (!payload || typeof payload !== "object") return undefined;

  const record = payload as Record<string, unknown>;
  const name = record.name;
  if (typeof name !== "string" || !knownToolNames.has(name)) return undefined;

  const args = record.arguments;
  if (args && typeof args === "object" && !Array.isArray(args)) {
    return { name, arguments: args as Record<string, unknown> };
  }

  if (typeof args === "string") {
    try {
      const parsed = JSON.parse(args) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { name, arguments: parsed as Record<string, unknown> };
      }
    } catch {
      return undefined;
    }
  }

  return undefined;
}

// Qwen2.5-Coder-3B often returns tool calls as markdown JSON in content
// instead of the native <tool_call> format that llama.cpp maps to tool_calls.
function extractToolCallsFromContent(
  content: string,
): ChatCompletionMessageToolCall[] {
  const calls: ChatCompletionMessageToolCall[] = [];
  let id = 0;

  const addCall = (name: string, args: Record<string, unknown>) => {
    calls.push({
      id: `parsed_${Date.now()}_${id++}`,
      type: "function",
      function: {
        name,
        arguments: JSON.stringify(args),
      },
    });
  };

  for (const match of content.matchAll(
    /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi,
  )) {
    try {
      const parsed = parseToolCallPayload(JSON.parse(match[1] ?? ""));
      if (parsed) addCall(parsed.name, parsed.arguments);
    } catch {
      // ignore malformed tool_call blocks
    }
  }
  if (calls.length > 0) return calls;

  for (const match of content.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)) {
    try {
      const parsed = parseToolCallPayload(JSON.parse(match[1] ?? ""));
      if (parsed) addCall(parsed.name, parsed.arguments);
    } catch {
      // ignore malformed fenced JSON
    }
  }
  if (calls.length > 0) return calls;

  try {
    const parsed = parseToolCallPayload(JSON.parse(content.trim()));
    if (parsed) addCall(parsed.name, parsed.arguments);
  } catch {
    // content is not a bare JSON tool call
  }

  return calls;
}

function normalizeAssistantMessage(
  message: ChatCompletionMessageParam,
): ChatCompletionMessageParam {
  if (message.role !== "assistant") return message;

  const toolCalls =
    "tool_calls" in message && message.tool_calls?.length
      ? message.tool_calls
      : undefined;
  if (toolCalls?.length) return message;

  const content =
    "content" in message && typeof message.content === "string"
      ? message.content
      : "";
  const parsedToolCalls = content ? extractToolCallsFromContent(content) : [];
  if (!parsedToolCalls.length) return message;

  return {
    role: "assistant",
    content: null,
    tool_calls: parsedToolCalls,
  };
}

async function streamAssistantReply(
  openai: OpenAI,
  model: string,
  maxTokens: number,
  messages: ChatCompletionMessageParam[],
  tools: ChatCompletionTool[] | undefined,
): Promise<{ text: string; message: ChatCompletionMessageParam }> {
  const stream = await openai.chat.completions.create({
    model,
    messages,
    tools,
    tool_choice: tools ? "auto" : undefined,
    max_tokens: maxTokens,
    stream: true,
  });

  let text = "";
  process.stdout.write("\nAssistant: ");

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;
    if (!delta) continue;

    if (delta.content) {
      text += delta.content;
      process.stdout.write(delta.content);
    }

    if (delta.tool_calls?.length) {
      throw new Error(
        "Streaming tool calls are not supported; disable tools or set LLM_STREAM=false",
      );
    }
  }

  process.stdout.write("\n\n");
  return { text, message: { role: "assistant", content: text } };
}

async function completeAssistantReply(
  openai: OpenAI,
  model: string,
  maxTokens: number,
  messages: ChatCompletionMessageParam[],
  tools: ChatCompletionTool[] | undefined,
): Promise<ChatCompletionMessageParam> {
  const response = await openai.chat.completions.create({
    model,
    messages,
    tools,
    tool_choice: tools ? "auto" : undefined,
    temperature: 0,
    max_tokens: maxTokens,
  });

  const assistantMessage = response.choices[0]?.message;
  if (!assistantMessage) {
    throw new Error("No response from model");
  }

  return assistantMessage;
}

export async function agentLoop(args: AgentLoopArgs): Promise<string> {
  const {
    systemInstruction,
    messages,
    model: modelOverride,
    enableTools = true,
    llm: llmOverrides,
    editorContext,
    onAssistantReply,
    onToolCall,
  } = args;

  const llm = resolveLlmConfig(llmOverrides);
  const openai = createOpenAIClient(llm);
  const model = modelOverride ?? llm.model;
  const useStreaming = false;
  const maxRounds = 2;
  let round = 0;

  while (round++ < maxRounds) {
    const requestMessages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemInstruction },
      ...messages,
    ];
    const requestTools = enableTools && tools.length > 0 ? tools : undefined;

    const rawAssistantMessage = useStreaming
      ? (await streamAssistantReply(
          openai,
          model,
          llm.maxTokens,
          requestMessages,
          requestTools,
        )).message
      : await completeAssistantReply(
          openai,
          model,
          llm.maxTokens,
          requestMessages,
          requestTools,
        );

    const assistantMessage = normalizeAssistantMessage(rawAssistantMessage);
    messages.push(assistantMessage);

    const toolCalls =
      "tool_calls" in assistantMessage
        ? assistantMessage.tool_calls
        : undefined;

    if (!toolCalls?.length) {
      const text =
        "content" in assistantMessage &&
        typeof assistantMessage.content === "string"
          ? assistantMessage.content
          : "";
      if (text && !useStreaming) {
        if (onAssistantReply) {
          onAssistantReply(text);
        } else {
          console.log(`\nAssistant: ${text}\n`);
        }
      }
      return text;
    }

    const toolCall = toolCalls.find((call) => call.type === "function");
    if (!toolCall || toolCall.type !== "function") continue;

    const { name, arguments: rawArgs } = toolCall.function;
    const fnArgs = rawArgs
      ? (JSON.parse(rawArgs) as Record<string, unknown>)
      : {};

    if (onToolCall) {
      onToolCall(name, fnArgs);
    } else {
      console.log(`\n[tool] ${name}(${JSON.stringify(fnArgs)})`);
    }

    const fn = editToolHandlers[name];
    if (!fn) {
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify({ error: `Unknown tool: ${name}` }),
      });
      continue;
    }

    let result: unknown;
    try {
      result = await fn(fnArgs, { editorContext });
    } catch (error) {
      result = { error: String(error) };
    }

    messages.push({
      role: "tool",
      tool_call_id: toolCall.id,
      content: JSON.stringify(result),
    });

    if (
      result &&
      typeof result === "object" &&
      "ok" in result &&
      result.ok === true
    ) {
      return "done";
    }
  }

  return "";
}
