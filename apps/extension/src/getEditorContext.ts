import * as vscode from "vscode";
import type { EditorContext, EditorPosition } from "../../backend/src/editorContext";
import { findEnclosingBlock } from "./findEnclosingBlock";

function toPosition(position: vscode.Position): EditorPosition {
  return { line: position.line, character: position.character };
}

export function getEditorContext(): EditorContext | null {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return null;

  const { document, selection } = editor;
  const cursorLine = selection.active.line;
  const contextRadius = 3;
  const startLine = Math.max(0, cursorLine - contextRadius);
  const endLine = Math.min(document.lineCount - 1, cursorLine + contextRadius);

  const surroundingLines = Array.from(
    { length: endLine - startLine + 1 },
    (_, index) => document.lineAt(startLine + index).text,
  ).join("\n");

  const enclosingBlock = selection.isEmpty
    ? findEnclosingBlock(document, cursorLine)
    : null;

  return {
    filePath: document.uri.fsPath,
    cursor: toPosition(selection.active),
    currentLine: document.lineAt(cursorLine).text,
    surroundingLines,
    enclosingBlock,
    selection: selection.isEmpty
      ? null
      : {
          start: toPosition(selection.start),
          end: toPosition(selection.end),
          text: document.getText(selection),
        },
  };
}
