import * as vscode from "vscode";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { SYSTEM_INSTRUCTION } from "../../backend/src/agentConfig";
import { resolveLlmConfig } from "../../backend/src/llmConfig";
import { agentLoop } from "../../backend/src/agentLoop";
import { buildUserMessageWithContext } from "../../backend/src/editorContext";
import { getEditorContext } from "./getEditorContext";
import { getLlmConfigFromSettings } from "./llmSettings";

const OUTPUT_CHANNEL_NAME = "Miagi";

async function runAgent(): Promise<void> {
  const userInput = await vscode.window.showInputBox({
    prompt: "What should the agent do?",
    placeHolder: "Fix the typo on this line",
  });
  if (!userInput?.trim()) return;

  const editorContext = getEditorContext();
  const output = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  output.show(true);
  output.appendLine(`You: ${userInput}`);
  if (editorContext) {
    output.appendLine(
      `Editor: ${editorContext.filePath} @ ${editorContext.cursor.line + 1}:${editorContext.cursor.character + 1}`,
    );
  }

  const llmOverrides = getLlmConfigFromSettings();
  const llm = resolveLlmConfig(llmOverrides);
  output.appendLine(`LLM: ${llm.baseURL} (model: ${llm.model})`);

  const messages: ChatCompletionMessageParam[] = [
    {
      role: "user",
      content: buildUserMessageWithContext(userInput.trim(), editorContext),
    },
  ];

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Miagi agent running",
        cancellable: false,
      },
      async () =>
        agentLoop({
          systemInstruction: SYSTEM_INSTRUCTION,
          messages,
          enableTools: true,
          llm: llmOverrides,
          onToolCall: (name, args) => {
            output.appendLine(`[tool] ${name}(${JSON.stringify(args)})`);
          },
          onAssistantReply: (text) => {
            output.appendLine(`Assistant: ${text}`);
          },
        }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    output.appendLine(`Error: ${message}`);
    void vscode.window.showErrorMessage(`Miagi agent failed: ${message}`);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("miagi.runAgent", () => {
      void runAgent();
    }),
    vscode.commands.registerCommand("miagi.logEditorContext", () => {
      const editorContext = getEditorContext();
      if (!editorContext) {
        void vscode.window.showInformationMessage("No active editor.");
        return;
      }

      const output = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
      output.show(true);
      output.appendLine(JSON.stringify(editorContext, null, 2));
      void vscode.window.showInformationMessage(
        `File: ${editorContext.filePath}, cursor: ${editorContext.cursor.line + 1}:${editorContext.cursor.character + 1}`,
      );
    }),
  );
}

export function deactivate(): void {}
