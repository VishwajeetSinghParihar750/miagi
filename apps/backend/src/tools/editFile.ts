import { readFile, writeFile } from "node:fs/promises";
import { mergeCodeEdit } from "../applyModel";
import type { EditorContext } from "../editorContext";
import type { ApplyLlmConfig } from "../llmConfig";

export type EditResult =
  | { ok: true; done: true; path: string }
  | { error: string };

function offsetAt(content: string, line: number, column: number): number {
  const lines = content.split("\n");
  if (line < 1 || line > lines.length) {
    throw new Error(
      `Line ${line} is out of range (file has ${lines.length} lines)`,
    );
  }

  let offset = 0;
  for (let i = 0; i < line - 1; i++) {
    offset += lines[i]!.length + 1;
  }

  const lineText = lines[line - 1]!;
  const col = column - 1;
  if (col < 0 || col > lineText.length) {
    throw new Error(`Column ${column} is out of range for line ${line}`);
  }

  return offset + col;
}

async function readAndWrite(
  filePath: string,
  transform: (content: string) => string,
): Promise<EditResult> {
  const content = await readFile(filePath, "utf8");
  const next = transform(content);
  await writeFile(filePath, next, "utf8");
  return { ok: true, done: true, path: filePath };
}

export function parseCodeEdit(response: string): string | null {
  const stripped = response.replace(/[\s\S]*?<\/think>/gi, "").trim();

  const tagged = stripped.match(/<code_edit>\s*([\s\S]*?)\s*<\/code_edit>/i);
  if (tagged?.[1]) return tagged[1].trim();

  const fenced = stripped.match(/```[^\n]*\n([\s\S]*?)\n```/);
  if (fenced?.[1]) return fenced[1].trim();

  return null;
}

function getOriginalCode(editorContext: EditorContext): string | null {
  if (editorContext.selection) {
    return editorContext.selection.text;
  }

  if (editorContext.enclosingBlock) {
    return editorContext.enclosingBlock.text;
  }

  if (editorContext.surroundingLines.trim()) {
    return editorContext.surroundingLines;
  }

  return null;
}

export async function applyMergedEdit(
  codeEdit: string,
  editorContext: EditorContext,
  applyLlm: ApplyLlmConfig,
): Promise<EditResult> {
  try {
    if (!editorContext.filePath) {
      return { error: "No active editor file" };
    }

    const originalCode = getOriginalCode(editorContext);
    if (!originalCode) {
      return { error: "No code context to merge against" };
    }

    const merged = await mergeCodeEdit(originalCode, codeEdit, applyLlm);
    const filePath = editorContext.filePath;

    if (editorContext.selection) {
      const { start, end } = editorContext.selection;
      return await readAndWrite(filePath, (content) => {
        const startOffset = offsetAt(
          content,
          start.line + 1,
          start.character + 1,
        );
        const endOffset = offsetAt(content, end.line + 1, end.character + 1);
        return content.slice(0, startOffset) + merged + content.slice(endOffset);
      });
    }

    if (editorContext.enclosingBlock) {
      const { startLine, endLine } = editorContext.enclosingBlock;
      return await readAndWrite(filePath, (content) => {
        const lines = content.split("\n");
        const before = lines.slice(0, startLine).join("\n");
        const after = lines.slice(endLine + 1).join("\n");
        const prefix = before.length > 0 ? `${before}\n` : "";
        const suffix = after.length > 0 ? `\n${after}` : "";
        return `${prefix}${merged}${suffix}`;
      });
    }

    const { line, character } = editorContext.cursor;
    return await readAndWrite(filePath, (content) => {
      const offset = offsetAt(content, line + 1, character + 1);
      return content.slice(0, offset) + merged + content.slice(offset);
    });
  } catch (error) {
    return { error: String(error) };
  }
}
