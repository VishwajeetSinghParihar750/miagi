import { capturePlannerReply } from "./capture";
import { loadConfig } from "./config";

type ChatMessage = {
  role?: string;
  content?: string;
};

type ChatCompletionRequest = {
  messages?: ChatMessage[];
  max_tokens?: number;
};

type ChatRequest = {
  message?: string;
};

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function extractUserMessage(messages?: ChatMessage[]): string {
  if (!messages?.length) return "";

  return messages
    .filter((message) => message.role === "user")
    .map((message) => message.content?.trim() ?? "")
    .filter(Boolean)
    .join("\n\n");
}

function buildCompletionResponse(content: string, model: string) {
  return {
    id: `chatcmpl-${crypto.randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };
}

async function handleChatCompletions(
  req: Request,
  config: ReturnType<typeof loadConfig>,
) {
  let body: ChatCompletionRequest;
  try {
    body = (await req.json()) as ChatCompletionRequest;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const userMessage = extractUserMessage(body.messages);
  if (!userMessage) {
    return json({ error: "At least one user message is required" }, 400);
  }

  const reply = await capturePlannerReply(config, userMessage);
  return json(buildCompletionResponse(reply, config.model));
}

async function handleChat(req: Request, config: ReturnType<typeof loadConfig>) {
  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const message = body.message?.trim();
  if (!message) {
    return json({ error: "message is required" }, 400);
  }

  const reply = await capturePlannerReply(config, message);
  return json({ reply, model: config.model });
}

const config = loadConfig();

const server = Bun.serve({
  port: config.port,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, source: "chatgpt-web" });
    }

    if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
      try {
        return await handleChatCompletions(req, config);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Failed to capture ChatGPT response";
        return json({ error: message }, 500);
      }
    }

    if (req.method === "POST" && url.pathname === "/v1/chat") {
      try {
        return await handleChat(req, config);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Failed to capture ChatGPT response";
        return json({ error: message }, 500);
      }
    }

    return json(
      {
        error: "Not found",
        routes: {
          "GET /health": "health check",
          "POST /v1/chat/completions": "planner endpoint backed by ChatGPT web UI",
          "POST /v1/chat": '{ "message": "your prompt" }',
        },
      },
      404,
    );
  },
});

console.log(
  `ChatGPT capture API listening on http://127.0.0.1:${server.port}`,
);
