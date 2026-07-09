import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { bash } from "./tools/bash";

const openai = new OpenAI({
  baseURL:
    process.env.LLM_BASE_URL ?? "http://192.168.0.103:11434/api/generate",
  apiKey: process.env.LLM_API_KEY ?? "dummy",
});

const DEFAULT_MODEL =
  process.env.LLM_MODEL ?? "Qwen/Qwen2.5-Coder-7B-Instruct-GGUF:Q4_K_M";

const MAX_TOKENS = Number(process.env.LLM_MAX_TOKENS ?? 512);

const tools = [bash.toolDefinition];
const knownToolNames = new Set(tools.map((tool) => tool.function.name));

const availableFunctions: Record<
  string,
  (args: Record<string, unknown>) => Promise<unknown> | unknown
> = {
  bash: (args) => {
    if (typeof args.command !== "string") {
      return { error: "command must be a string" };
    }
    return bash.toolCall({ command: args.command });
  },
};

export type AgentLoopArgs = {
  systemInstruction: string;
  messages: ChatCompletionMessageParam[];
  model?: string;
};

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
  model: string,
  messages: ChatCompletionMessageParam[],
  tools: ChatCompletionTool[] | undefined,
): Promise<{ text: string; message: ChatCompletionMessageParam }> {
  const stream = await openai.chat.completions.create({
    model,
    messages,
    tools,
    tool_choice: tools ? "auto" : undefined,
    max_tokens: MAX_TOKENS,
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
  model: string,
  messages: ChatCompletionMessageParam[],
  tools: ChatCompletionTool[] | undefined,
): Promise<ChatCompletionMessageParam> {
  const response = await openai.chat.completions.create({
    model,
    messages,
    tools,
    tool_choice: tools ? "auto" : undefined,
    temperature: 0,
    max_tokens: MAX_TOKENS,
  });

  const assistantMessage = response.choices[0]?.message;
  if (!assistantMessage) {
    throw new Error("No response from model");
  }

  return assistantMessage;
}

export async function agentLoop(args: AgentLoopArgs): Promise<string> {
  const { systemInstruction, messages, model = DEFAULT_MODEL } = args;

  const useStreaming = false;

  while (true) {
    const requestMessages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemInstruction },
      ...messages,
    ];
    const requestTools = tools.length > 0 ? tools : undefined;

    const rawAssistantMessage = useStreaming
      ? (await streamAssistantReply(model, requestMessages, requestTools))
          .message
      : await completeAssistantReply(model, requestMessages, requestTools);

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
        console.log(`\nAssistant: ${text}\n`);
      }
      return text;
    }

    for (const toolCall of toolCalls) {
      if (toolCall.type !== "function") continue;

      const { name, arguments: rawArgs } = toolCall.function;
      const fnArgs = rawArgs
        ? (JSON.parse(rawArgs) as Record<string, unknown>)
        : {};

      console.log(`\n[tool] ${name}(${JSON.stringify(fnArgs)})`);

      const fn = availableFunctions[name];
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
        result = await fn(fnArgs);
      } catch (error) {
        result = { error: String(error) };
      }

      console.log(`[tool result] ${JSON.stringify(result)}`);

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }
  }
}
