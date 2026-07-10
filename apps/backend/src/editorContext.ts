export type EditorPosition = {
  line: number;
  character: number;
};

export type EditorContext = {
  filePath: string;
  cursor: EditorPosition;
  currentLine: string;
  surroundingLines: string;
  selection: {
    start: EditorPosition;
    end: EditorPosition;
    text: string;
  } | null;
};

export function formatEditorContextForPrompt(context: EditorContext): string {
  const lines = [
    "[Editor context]",
    `File: ${context.filePath}`,
    `Cursor: line ${context.cursor.line + 1}, column ${context.cursor.character + 1}`,
    `Current line: ${context.currentLine || "(empty)"}`,
    "Nearby code:",
    "```",
    context.surroundingLines,
    "```",
  ];

  if (context.selection) {
    const { start, end, text } = context.selection;
    lines.push(
      `Selection: lines ${start.line + 1}-${end.line + 1}, columns ${start.character + 1}-${end.character + 1}`,
      "```",
      text,
      "```",
    );
  }

  return lines.join("\n");
}

export function buildUserMessageWithContext(
  userInput: string,
  context: EditorContext | null | undefined,
): string {
  if (!context) return userInput;
  return `${formatEditorContextForPrompt(context)}\n\nUser request:\n${userInput}`;
}
