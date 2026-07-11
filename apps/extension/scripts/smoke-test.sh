#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; exit 1; }
skip() { echo "SKIP: $1"; }

echo "== Typecheck =="
bun run check-types
pass "typescript"

echo "== Build =="
bun run build
test -f dist/extension.js
pass "extension bundle"

echo "== Playwright proxy (:3100) =="
if curl -sf http://127.0.0.1:3100/health >/dev/null 2>&1; then
  pass "health endpoint"

  response="$(curl -sf -X POST http://127.0.0.1:3100/v1/chat/completions \
    -H "Content-Type: application/json" \
    -d '{"messages":[{"role":"user","content":"Reply with exactly: pong"}],"max_tokens":16}')"

  if echo "$response" | grep -q '"role":"assistant"'; then
    pass "chat completions endpoint"
  else
    fail "chat completions returned unexpected payload: $response"
  fi
else
  skip "proxy not running — start with: cd apps/extension && bun run playwright:api"
fi

echo "== Apply LLM / FastEdit (:8081) =="
if curl -sf http://127.0.0.1:8081/health >/dev/null 2>&1; then
  pass "health endpoint"
else
  skip "FastEdit not running on :8081"
fi

echo
echo "Smoke test finished."
