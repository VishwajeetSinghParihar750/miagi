import type { ChatCompletionTool } from "openai/resources/chat/completions";

export const tools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_current_time",
      description: "Get the current date and time in ISO format.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate",
      description: "Evaluate a basic arithmetic expression (numbers, +, -, *, /, parentheses).",
      parameters: {
        type: "object",
        properties: {
          expression: {
            type: "string",
            description: "The arithmetic expression to evaluate, e.g. '(2 + 3) * 4'",
          },
        },
        required: ["expression"],
        additionalProperties: false,
      },
    },
  },
];

function safeCalculate(expression: string): number {
  const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, "");
  if (!sanitized.trim()) {
    throw new Error("Invalid expression");
  }
  // eslint-disable-next-line no-new-func
  return Function(`"use strict"; return (${sanitized})`)() as number;
}

export const availableFunctions: Record<
  string,
  (args: Record<string, unknown>) => Promise<unknown> | unknown
> = {
  get_current_time: () => new Date().toISOString(),
  calculate: ({ expression }) => {
    if (typeof expression !== "string") {
      return { error: "expression must be a string" };
    }
    try {
      return { result: safeCalculate(expression) };
    } catch (error) {
      return { error: String(error) };
    }
  },
};
