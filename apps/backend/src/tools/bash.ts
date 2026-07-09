import { exec } from "child_process";
import { promisify } from "util";
import type { ChatCompletionTool } from "openai/resources/chat/completions";

const asyncExec = promisify(exec);

const bashRun = async (args: {
  command: string;
}): Promise<{ stderr: string; stdout: string } | { error: string }> => {
  try {
    return await asyncExec(args.command);
  } catch (error) {
    return { error: (error as Error).message };
  }
};

const bashTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "bash",
    description:
      "Run a shell command via bash. Returns { stdout, stderr } on success or { error } on failure.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The shell command to execute",
        },
      },
      required: ["command"],
      additionalProperties: false,
    },
  },
};

const bash = { toolDefinition: bashTool, toolCall: bashRun };

export { bash };
