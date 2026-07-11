import OpenAI from "openai";

import type { AppConfig } from "./config";

export function createClient(config: AppConfig): OpenAI {
  return new OpenAI({ apiKey: config.apiKey });
}

export async function askGpt(
  client: OpenAI,
  config: AppConfig,
  message: string,
): Promise<string> {
  const completion = await client.chat.completions.create({
    model: config.model,
    messages: [{ role: "user", content: message }],
  });

  const reply = completion.choices[0]?.message?.content?.trim();
  if (!reply) {
    throw new Error("OpenAI returned an empty response");
  }

  return reply;
}
