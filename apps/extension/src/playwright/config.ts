export type AppConfig = {
  port: number;
  model: string;
  chatGptUrl: string;
  userDataDir: string;
  headless: boolean;
  responseTimeoutMs: number;
};

function pickString(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export function loadConfig(): AppConfig {
  const port = Number(process.env.PORT ?? "3100");
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error("PORT must be a positive number");
  }

  const responseTimeoutMs = Number(process.env.PLAYWRIGHT_RESPONSE_TIMEOUT_MS ?? "120000");
  if (!Number.isFinite(responseTimeoutMs) || responseTimeoutMs <= 0) {
    throw new Error("PLAYWRIGHT_RESPONSE_TIMEOUT_MS must be a positive number");
  }

  return {
    port,
    model: pickString(process.env.PLAYWRIGHT_MODEL, "chatgpt-web"),
    chatGptUrl: pickString(process.env.CHATGPT_URL, "https://chatgpt.com/"),
    userDataDir: pickString(
      process.env.PLAYWRIGHT_USER_DATA_DIR,
      ".playwright-profile",
    ),
    headless: process.env.PLAYWRIGHT_HEADLESS === "true",
    responseTimeoutMs,
  };
}
