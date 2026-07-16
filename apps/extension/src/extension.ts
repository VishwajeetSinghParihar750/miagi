import * as vscode from "vscode";

// ── edit these ──────────────────────────────────────────────────────────────
// Run two servers:
//   llama serve -m .../qwen2.5-coder-1.5b-instruct-q4_k_m.gguf --port 8081 -a qwen
//   llama serve -m .../fastedit-1.7b-Q8_0.gguf --port 8080 -a fastedit
const PLANNER = {
  baseURL: "http://192.168.0.104:11434/v1",
  model: "qwen2.5-coder:7B",
  apiKey: "dummy",
  maxTokens: 512,
  temperature: 0,
  timeoutMs: 120_000,
};

const APPLY = {
  baseURL: "http://127.0.0.1:8080/v1",
  model: "fastedit",
  apiKey: "dummy",
  maxTokens: 1024,
  temperature: 0,
  timeoutMs: 120_000,
};
// ────────────────────────────────────────────────────────────────────────────

type Llm = typeof PLANNER;

const PLANNER_SYSTEM = `You write a lazy code edit for FastEdit to merge.

Given ORIGINAL code and a USER REQUEST, output ONLY an <update>...</update> block.
Inside it, show the changed region as code — not English instructions.
Use // ... existing code ... (or # ... in Python) for unchanged lines.
Do not paste the whole file. Do not explain. Do not use markdown fences.
/no_think`;

const APPLY_SYSTEM = `Merge the user's update into the original code.
Change only what the update specifies. Add nothing extra. Leave everything else identical.
/no_think`;

async function chat(
  llm: Llm,
  system: string,
  user: string,
  label: string,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), llm.timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${llm.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${llm.apiKey}`,
      },
      body: JSON.stringify({
        model: llm.model,
        temperature: llm.temperature,
        max_tokens: llm.maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(`${label} timed out after ${llm.timeoutMs}ms`);
    }
    throw new Error(`${label} unreachable at ${llm.baseURL}: ${String(err)}`);
  } finally {
    clearTimeout(timer);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string } | string;
  };

  if (!res.ok) {
    const detail =
      typeof data.error === "string" ? data.error : data.error?.message;
    throw new Error(`${label} ${res.status}: ${detail ?? ""}`);
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error(`${label} returned empty response`);
  return content;
}

function stripThink(raw: string): string {
  return raw.replace(/[\s\S]*?<\/think>/gi, "").trim();
}

/** Qwen → lazy edit snippet for FastEdit. */
function parseUpdate(raw: string): string {
  let text = stripThink(raw);

  const tagged =
    text.match(/<update>\s*([\s\S]*?)\s*<\/update>/i) ??
    text.match(/<code_edit>\s*([\s\S]*?)\s*<\/code_edit>/i);
  if (tagged?.[1] !== undefined) return tagged[1].trim();

  const fenced = text.match(/```[^\n]*\n([\s\S]*?)\n```/);
  if (fenced?.[1] !== undefined) return fenced[1].trim();

  return text.trim();
}

/** FastEdit → full merged code. */
function parseMerged(raw: string): string {
  let text = stripThink(raw);

  const tagged = text.match(
    /<updated[-_]code>\s*([\s\S]*?)\s*<\/updated[-_]code>/i,
  );
  if (tagged?.[1] !== undefined) text = tagged[1];

  let prev: string;
  do {
    prev = text;
    text = text
      .replace(/^\s*<code>\s*/i, "")
      .replace(/\s*<\/code>\s*$/i, "")
      .trim();
  } while (text !== prev);

  const fenced = text.match(/^```[^\n]*\n([\s\S]*?)\n```$/);
  if (fenced?.[1] !== undefined) text = fenced[1];

  return text.trim();
}

async function planUpdate(code: string, request: string): Promise<string> {
  const raw = await chat(
    PLANNER,
    PLANNER_SYSTEM,
    `ORIGINAL:\n\`\`\`\n${code}\n\`\`\`\n\nREQUEST: ${request}\n\nReply with <update>...</update> only.`,
    "planner",
  );
  const update = parseUpdate(raw);
  if (!update) throw new Error("planner produced no update snippet");
  return update;
}

async function applyUpdate(code: string, update: string): Promise<string> {
  const raw = await chat(
    APPLY,
    APPLY_SYSTEM,
    `Apply the <update> to <code>. Output the full result in <updated-code>...</updated-code> tags only.

<code>${code}</code>

<update>${update}</update>`,
    "fastedit",
  );
  const merged = parseMerged(raw);
  if (!merged) throw new Error("fastedit produced no code");
  return merged;
}

async function run(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showErrorMessage("No active editor.");
    return;
  }

  const { document, selection } = editor;
  if (selection.isEmpty) {
    void vscode.window.showErrorMessage("Select some code first.");
    return;
  }

  const original = document.getText(selection);
  const request = await vscode.window.showInputBox({
    prompt: "What should change?",
    placeHolder: "add console.log('hi') at the start of this function",
  });
  if (!request?.trim()) return;

  const output = vscode.window.createOutputChannel("Miagi");
  output.show(true);
  output.appendLine(`Request: ${request.trim()}`);

  try {
    const merged = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Miagi",
        cancellable: false,
      },
      async (progress) => {
        progress.report({ message: "Qwen planning…" });
        const update = await planUpdate(original, request.trim());
        output.appendLine(`[update]\n${update}\n`);

        progress.report({ message: "FastEdit merging…" });
        const result = await applyUpdate(original, update);
        output.appendLine(`[merged]\n${result}`);
        return result;
      },
    );

    const ok = await editor.edit((b) => b.replace(selection, merged));
    if (!ok) throw new Error("edit failed");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    output.appendLine(`Error: ${msg}`);
    void vscode.window.showErrorMessage(`Miagi: ${msg}`);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("miagi.fastEdit", () => {
      void run();
    }),
  );
}

export function deactivate(): void {}
