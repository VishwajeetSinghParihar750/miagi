import { readFile, writeFile } from "node:fs/promises";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import type { EditorContext } from "../editorContext";

type EditToolContext = {
  editorContext?: EditorContext | null;
};

type EditResult = { ok: true; done: true; path: string } | { error: string };

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

const applyEditTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "apply_edit",
    description:
      "Apply a code edit. Pass the full updated function or selection text.",
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "The complete updated code to write",
        },
      },
      required: ["text"],
      additionalProperties: false,
    },
  },
};

async function applyEdit(
  args: Record<string, unknown>,
  ctx: EditToolContext,
): Promise<EditResult> {
  try {
    const text = args.text;
    if (typeof text !== "string") {
      return { error: "text must be a string" };
    }

    const editorContext = ctx.editorContext;
    if (!editorContext?.filePath) {
      return { error: "No active editor file" };
    }

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
        return content.slice(0, startOffset) + text + content.slice(endOffset);
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
        return `${prefix}${text}${suffix}`;
      });
    }

    const { line, character } = editorContext.cursor;
    return await readAndWrite(filePath, (content) => {
      const offset = offsetAt(content, line + 1, character + 1);
      return content.slice(0, offset) + text + content.slice(offset);
    });
  } catch (error) {
    return { error: String(error) };
  }
}

const editToolDefinitions = [applyEditTool];

const editToolHandlers: Record<
  string,
  (args: Record<string, unknown>, ctx: EditToolContext) => Promise<EditResult>
> = {
  apply_edit: applyEdit,
};

export { editToolDefinitions, editToolHandlers };
