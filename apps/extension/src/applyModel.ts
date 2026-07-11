import { APPLY_SYSTEM_INSTRUCTION } from "./agentConfig";
import { createOpenAIClient, type ApplyLlmConfig } from "./llmConfig";

function buildFastEditUserMessage(
  originalCode: string,
  updateSnippet: string,
): string {
  return `Apply the <update> to <code>. Output the full result in <updated-code>...</updated-code> tags only.

<code>${originalCode}</code>

<update>${updateSnippet}</update>`;
}

export function parseUpdatedCode(response: string): string {
  const tagged = response.match(
    /<updated[-_]code>\s*([\s\S]*?)\s*<\/updated[-_]code>/i,
  );
  if (tagged?.[1]) return tagged[1].trim();

  const stripped = response.replace(/[\s\S]*?<\/think>/gi, "").trim();
  if (stripped.startsWith("```")) {
    const fenced = stripped.match(/^```[^\n]*\n([\s\S]*?)\n```$/);
    if (fenced?.[1]) return fenced[1].trim();
  }

  return stripped;
}

export async function mergeCodeEdit(
  originalCode: string,
  updateSnippet: string,
  config: ApplyLlmConfig,
): Promise<string> {
  const openai = createOpenAIClient(config);
  const response = await openai.chat.completions.create({
    model: config.model,
    messages: [
      { role: "system", content: APPLY_SYSTEM_INSTRUCTION },
      {
        role: "user",
        content: buildFastEditUserMessage(originalCode, updateSnippet),
      },
    ],
    temperature: 0,
    max_tokens: config.maxTokens,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Apply model returned empty response");
  }

  const merged = parseUpdatedCode(content);
  if (!merged) {
    throw new Error("Apply model returned no parseable code");
  }

  return merged;
}
