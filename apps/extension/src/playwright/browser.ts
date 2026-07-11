import { chromium, type BrowserContext } from "playwright";

import type { AppConfig } from "./config";

let contextPromise: Promise<BrowserContext> | null = null;

export async function getBrowserContext(
  config: AppConfig,
): Promise<BrowserContext> {
  if (!contextPromise) {
    contextPromise = chromium.launchPersistentContext(config.userDataDir, {
      headless: config.headless,
      viewport: { width: 1280, height: 900 },
    });
  }

  return contextPromise;
}

export async function closeBrowserContext(): Promise<void> {
  if (!contextPromise) return;

  const context = await contextPromise;
  await context.close();
  contextPromise = null;
}
