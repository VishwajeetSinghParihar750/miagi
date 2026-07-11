import { loadConfig } from "./config";
import { askGpt, createClient } from "./openai";

type ChatRequest = {
  message?: string;
};

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
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

  const client = createClient(config);
  const reply = await askGpt(client, config, message);

  return json({ reply, model: config.model });
}

const config = loadConfig();

const server = Bun.serve({
  port: config.port,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/health") {
      return json({ ok: true });
    }

    if (req.method === "POST" && url.pathname === "/v1/chat") {
      try {
        return await handleChat(req, config);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to get OpenAI response";
        return json({ error: message }, 500);
      }
    }

    return json(
      {
        error: "Not found",
        routes: {
          "GET /health": "health check",
          "POST /v1/chat": '{ "message": "your prompt" }',
        },
      },
      404,
    );
  },
});

console.log(`OpenAI chat API listening on http://127.0.0.1:${server.port}`);
