export type EditorPosition = {
  line: number;
  character: number;
};

export type EnclosingBlock = {
  startLine: number;
  endLine: number;
  text: string;
};

export type EditorContext = {
  filePath: string;
  cursor: EditorPosition;
  currentLine: string;
  surroundingLines: string;
  enclosingBlock: EnclosingBlock | null;
  selection: {
    start: EditorPosition;
    end: EditorPosition;
    text: string;
  } | null;
};

export function formatEditorContextForPrompt(context: EditorContext): string {
  if (context.selection) {
    return [
      `File: ${context.filePath}`,
      "Selection:",
      "```",
      context.selection.text,
      "```",
    ].join("\n");
  }

  if (context.enclosingBlock) {
    return [
      `File: ${context.filePath}`,
      `Cursor: line ${context.cursor.line + 1}`,
      "Block at cursor:",
      "```",
      context.enclosingBlock.text,
      "```",
    ].join("\n");
  }

  return [
    `File: ${context.filePath}`,
    `Cursor: line ${context.cursor.line + 1}`,
    "Nearby code:",
    "```",
    context.surroundingLines,
    "```",
  ].join("\n");
}

export function buildUserMessageWithContext(
  userInput: string,
  context: EditorContext | null | undefined,
): string {
  if (!context) return userInput;
  return `${formatEditorContextForPrompt(context)}\n\nRequest: ${userInput}`;
}
