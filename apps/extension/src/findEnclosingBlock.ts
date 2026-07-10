import * as vscode from "vscode";

export type EnclosingBlock = {
  startLine: number;
  endLine: number;
  text: string;
};

function findOpeningBraceLine(
  document: vscode.TextDocument,
  fromLine: number,
): number | null {
  for (let line = fromLine; line < document.lineCount; line++) {
    if (document.lineAt(line).text.includes("{")) return line;
  }
  return null;
}

export function findEnclosingBlock(
  document: vscode.TextDocument,
  cursorLine: number,
): EnclosingBlock | null {
  let startLine = cursorLine;
  while (startLine >= 0) {
    const text = document.lineAt(startLine).text;
    if (/\bfunction\b/.test(text) || /=>\s*\{/.test(text)) break;
    startLine--;
  }
  if (startLine < 0) return null;

  const braceLine = findOpeningBraceLine(document, startLine);
  if (braceLine === null) return null;

  const braceIndex = document.lineAt(braceLine).text.indexOf("{");
  let depth = 0;
  let endLine = braceLine;

  for (let line = braceLine; line < document.lineCount; line++) {
    const text = document.lineAt(line).text;
    const fromColumn = line === braceLine ? braceIndex : 0;

    for (let column = fromColumn; column < text.length; column++) {
      const char = text[column];
      if (char === "{") depth++;
      if (char === "}") {
        depth--;
        if (depth === 0) {
          endLine = line;
          const range = new vscode.Range(
            new vscode.Position(startLine, 0),
            new vscode.Position(endLine, document.lineAt(endLine).text.length),
          );
          return {
            startLine,
            endLine,
            text: document.getText(range),
          };
        }
      }
    }
  }

  return null;
}
