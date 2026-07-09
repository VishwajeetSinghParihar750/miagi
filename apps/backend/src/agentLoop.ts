import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { bash } from "./tools/bash";

const openai = new OpenAI({
  baseURL: process.env.LLM_BASE_URL ?? "http://127.0.0.1:8080/v1",
  apiKey: process.env.LLM_API_KEY ?? "dummy",
});

const DEFAULT_MODEL =
  process.env.LLM_MODEL ?? "Qwen/Qwen2.5-Coder-3B-Instruct-GGUF:Q4_K_M";

const MAX_TOKENS = Number(process.env.LLM_MAX_TOKENS ?? 512);

const tools = [bash.toolDefinition];

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

async function streamAssistantReply(
  model: string,
  messages: ChatCompletionMessageParam[],
  tools: ChatCompletionTool[] | undefined,
): Promise<{ text: string; message: ChatCompletionMessageParam }> {
  const stream = await openai.chat.completions.create({
    model,
    messages,
    tools,
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

    const assistantMessage = useStreaming
      ? (await streamAssistantReply(model, requestMessages, requestTools))
          .message
      : await completeAssistantReply(model, requestMessages, requestTools);

    messages.push(assistantMessage);

    const toolCalls =
      "tool_calls" in assistantMessage ? assistantMessage.tool_calls : undefined;

    if (!toolCalls?.length) {
      const text =
        "content" in assistantMessage && typeof assistantMessage.content === "string"
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
