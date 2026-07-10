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
      `Open file: ${context.filePath}`,
      "Selected code (respond with a lazy edit in <code_edit> tags, using // ... existing code ... for unchanged parts):",
      "```",
      context.selection.text,
      "```",
    ].join("\n");
  }

  if (context.enclosingBlock) {
    return [
      `Open file: ${context.filePath}`,
      `Cursor on line ${context.cursor.line + 1}`,
      "Function at cursor (respond with a lazy edit in <code_edit> tags, using // ... existing code ... for unchanged parts):",
      "```",
      context.enclosingBlock.text,
      "```",
    ].join("\n");
  }

  return [
    `Open file: ${context.filePath}`,
    `Cursor on line ${context.cursor.line + 1}`,
    "Nearby code (respond with a lazy edit in <code_edit> tags, using // ... existing code ... for unchanged parts):",
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
  return `${formatEditorContextForPrompt(context)}\n\nUser request:\n${userInput}`;
}
