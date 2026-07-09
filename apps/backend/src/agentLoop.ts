import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";

const openai = new OpenAI({
  baseURL: "http://localhost:8080",
  apiKey: "dummy",
});

const DEFAULT_MODEL = "gpt-4o-mini";

export type AgentLoopArgs = {
  systemInstruction: string;
  messages: ChatCompletionMessageParam[];
  tools: ChatCompletionTool[];
  availableFunctions: Record<
    string,
    (args: Record<string, unknown>) => Promise<unknown> | unknown
  >;
  model?: string;
};

export async function agentLoop(args: AgentLoopArgs): Promise<string> {
  const {
    systemInstruction,
    messages,
    tools,
    availableFunctions,
    model = DEFAULT_MODEL,
  } = args;

  while (true) {
    const response = await openai.chat.completions.create({
      model,
      messages: [{ role: "system", content: systemInstruction }, ...messages],
      tools: tools.length > 0 ? tools : undefined,
    });

    const assistantMessage = response.choices[0]?.message;
    if (!assistantMessage) {
      throw new Error("No response from model");
    }

    messages.push(assistantMessage);

    const toolCalls = assistantMessage.tool_calls;
    if (!toolCalls?.length) {
      const text = assistantMessage.content ?? "";
      if (text) {
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
