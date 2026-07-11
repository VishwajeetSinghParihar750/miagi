import type { Locator, Page } from "playwright";

import { getBrowserContext } from "./browser";
import type { AppConfig } from "./config";
import { PLANNER_SYSTEM_INSTRUCTION } from "./plannerInstruction";

const PROMPT_SELECTORS = [
  "#prompt-textarea",
  "textarea#prompt-textarea",
  "div#prompt-textarea",
  '[data-testid="prompt-textarea"]',
  'textarea[placeholder*="Ask"]',
  'div[contenteditable="true"]',
];

const ASSISTANT_MESSAGE_SELECTOR = '[data-message-author-role="assistant"]';

let requestChain = Promise.resolve();

function withRequestLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = requestChain.then(fn, fn);
  requestChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function findPrompt(page: Page): Promise<Locator> {
  for (const selector of PROMPT_SELECTORS) {
    const locator = page.locator(selector).first();
    try {
      await locator.waitFor({ state: "visible", timeout: 5000 });
      return locator;
    } catch {
      continue;
    }
  }

  throw new Error(
    "Could not find ChatGPT prompt box. Open ChatGPT in the browser profile and log in once if needed.",
  );
}

async function waitForStableText(
  locator: Locator,
  timeoutMs: number,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let lastText = "";
  let stableSince = Date.now();

  while (Date.now() < deadline) {
    const text = (await locator.innerText()).trim();
    if (text && text === lastText && Date.now() - stableSince >= 1500) {
      return text;
    }

    if (text !== lastText) {
      lastText = text;
      stableSince = Date.now();
    }

    await locator.page().waitForTimeout(300);
  }

  if (lastText) return lastText;
  throw new Error("Timed out waiting for ChatGPT response");
}

async function captureOnPage(
  page: Page,
  config: AppConfig,
  userMessage: string,
): Promise<string> {
  await page.goto(config.chatGptUrl, {
    waitUntil: "domcontentloaded",
    timeout: config.responseTimeoutMs,
  });

  if (page.url().includes("/auth")) {
    throw new Error(
      "ChatGPT login required. Run `bun run playwright:api` with PLAYWRIGHT_HEADLESS=false, log in once, then retry.",
    );
  }

  const prompt = await findPrompt(page);
  const fullPrompt = `${PLANNER_SYSTEM_INSTRUCTION}\n\n${userMessage}`;

  await prompt.click();
  await prompt.fill(fullPrompt);

  const sendButton = page
    .locator('button[data-testid="send-button"], button[aria-label="Send prompt"]')
    .first();

  if (await sendButton.isVisible().catch(() => false)) {
    await sendButton.click();
  } else {
    await page.keyboard.press("Enter");
  }

  const assistantMessages = page.locator(ASSISTANT_MESSAGE_SELECTOR);
  const latestReply = assistantMessages.last();

  await latestReply.waitFor({
    state: "visible",
    timeout: config.responseTimeoutMs,
  });

  const reply = await waitForStableText(latestReply, config.responseTimeoutMs);
  if (!reply) {
    throw new Error("ChatGPT returned an empty response");
  }

  return reply;
}

export async function capturePlannerReply(
  config: AppConfig,
  userMessage: string,
): Promise<string> {
  return withRequestLock(async () => {
    const context = await getBrowserContext(config);
    const page = await context.newPage();

    try {
      return await captureOnPage(page, config, userMessage);
    } finally {
      await page.close();
    }
  });
}
