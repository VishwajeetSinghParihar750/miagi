import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { agentLoop } from "./agentLoop";

const SYSTEM_INSTRUCTION =
  "You are a helpful assistant. Use the bash tool to run shell commands when needed.";

const messages: ChatCompletionMessageParam[] = [];
const rl = readline.createInterface({ input, output });

async function main(): Promise<void> {
  console.log("Agent ready. Type 'exit' to quit.\n");

  while (true) {
    const userInput = (await rl.question("You: ")).trim();
    if (!userInput) continue;
    if (userInput.toLowerCase() === "exit") break;

    messages.push({ role: "user", content: userInput });

    try {
      await agentLoop({
        systemInstruction: SYSTEM_INSTRUCTION,
        messages,
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
