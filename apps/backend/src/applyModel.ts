import { createOpenAIClient, type ApplyLlmConfig } from "./llmConfig";

const FASTEDIT_SYSTEM =
  "You are a coding assistant that helps merge code updates, ensuring every modification is fully integrated. /no_think";

function buildFastEditUserMessage(
  originalCode: string,
  updateSnippet: string,
): string {
  return `Merge all changes from the <update> snippet into the <code> below.
- Preserve the code's structure, order, comments, and indentation exactly.
- Output only the updated code, enclosed within <updated-code> and </updated-code> tags.
- Do not include any additional text, explanations, placeholders, ellipses, or code fences.

<code>${originalCode}</code>

<update>${updateSnippet}</update>

Provide the complete updated code.`;
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
      { role: "system", content: FASTEDIT_SYSTEM },
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
