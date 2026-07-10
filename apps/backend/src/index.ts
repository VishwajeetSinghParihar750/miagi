import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { SYSTEM_INSTRUCTION } from "./agentConfig";
import { agentLoop } from "./agentLoop";
import {
  buildUserMessageWithContext,
  type EditorContext,
} from "./editorContext";

function parseEditorContextFromEnv(): EditorContext | null {
  const raw = process.env.EDITOR_CONTEXT;
  if (!raw) return null;

  try {
    return JSON.parse(raw) as EditorContext;
  } catch {
    return null;
  }
}

const rl = readline.createInterface({ input, output });

async function main(): Promise<void> {
  console.log("Agent ready. Type 'exit' to quit.\n");

  while (true) {
    const userInput = (await rl.question("You: ")).trim();
    if (!userInput) continue;
    if (userInput.toLowerCase() === "exit") break;

    const editorContext = parseEditorContextFromEnv();
    const messages: ChatCompletionMessageParam[] = [];
    messages.push({
      role: "user",
      content: buildUserMessageWithContext(userInput, editorContext),
    });

    try {
      await agentLoop({
        systemInstruction: SYSTEM_INSTRUCTION,
        messages,
        enableTools: true,
      });
    } catch (error) {
      console.error("\nAgent error:", error);
    }
  }

  rl.close();
  console.log("Goodbye.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
