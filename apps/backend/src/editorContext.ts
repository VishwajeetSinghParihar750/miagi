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
      "Selected code (replace this whole block in apply_edit):",
      context.selection.text,
    ].join("\n");
  }

  if (context.enclosingBlock) {
    return [
      `Open file: ${context.filePath}`,
      "Function at cursor (replace this whole block in apply_edit):",
      context.enclosingBlock.text,
    ].join("\n");
  }

  return [
    `Open file: ${context.filePath}`,
    `Cursor line: ${context.cursor.line + 1}`,
    "Nearby code:",
    context.surroundingLines,
  ].join("\n");
}

export function buildUserMessageWithContext(
  userInput: string,
  context: EditorContext | null | undefined,
): string {
  if (!context) return userInput;
  return `${formatEditorContextForPrompt(context)}\n\nUser request:\n${userInput}`;
}
