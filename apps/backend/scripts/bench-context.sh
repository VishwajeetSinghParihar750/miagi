#!/usr/bin/env bash
# Benchmark first-request TPS at different llama.cpp context sizes.
set -euo pipefail

MODEL="Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF:Q4_K_M"
HOST="127.0.0.1"
PORT="8080"
LOG_DIR="/tmp/llama-bench-$$"
mkdir -p "$LOG_DIR"

PAYLOAD='{
  "model": "'"$MODEL"'",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant. Use tools when they help answer the user."},
    {"role": "user", "content": "how are you"}
  ],
  "max_tokens": 128,
  "stream": false
}'

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

wait_for_server() {
  for _ in $(seq 1 120); do
    if curl -sf "http://${HOST}:${PORT}/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  echo "Server failed to start" >&2
  return 1
}

run_bench() {
  local label="$1"
  shift
  local log="$LOG_DIR/${label}.log"

  echo "=== Testing context: $label ==="

  llama serve -hf "$MODEL" "$@" >"$log" 2>&1 &
  SERVER_PID=$!
  wait_for_server

  # Cold first request only
  curl -sf "http://${HOST}:${PORT}/v1/chat/completions" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" >/dev/null

  sleep 1

  local n_ctx
  n_ctx=$(grep -oP 'n_ctx_slot = \K[0-9]+' "$log" | head -1 || echo "?")

  local prompt_tps eval_tps prompt_ms eval_ms prompt_tokens eval_tokens total_ms
  prompt_tps=$(grep 'prompt eval time' "$log" | tail -1 | grep -oP '[0-9]+\.[0-9]+ tokens per second\)' | grep -oP '^[0-9.]+' || echo "n/a")
  eval_tps=$(grep 'eval time' "$log" | grep -v 'prompt eval' | tail -1 | grep -oP '[0-9]+\.[0-9]+ tokens per second\)' | grep -oP '^[0-9.]+' || echo "n/a")
  prompt_ms=$(grep 'prompt eval time' "$log" | tail -1 | grep -oP '=\s+\K[0-9.]+' | head -1 || echo "n/a")
  eval_ms=$(grep 'eval time' "$log" | grep -v 'prompt eval' | tail -1 | grep -oP '=\s+\K[0-9.]+' | head -1 || echo "n/a")
  prompt_tokens=$(grep 'prompt eval time' "$log" | tail -1 | grep -oP '/\s+\K[0-9]+' || echo "n/a")
  eval_tokens=$(grep 'eval time' "$log" | grep -v 'prompt eval' | tail -1 | grep -oP '/\s+\K[0-9]+' || echo "n/a")
  total_ms=$(grep 'total time' "$log" | tail -1 | grep -oP '=\s+\K[0-9.]+' | head -1 || echo "n/a")

  printf '%s\n' "$label,$n_ctx,$prompt_tokens,$prompt_ms,$prompt_tps,$eval_tokens,$eval_ms,$eval_tps,$total_ms"

  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
  SERVER_PID=""
  sleep 2
}

echo "label,n_ctx,prompt_tokens,prompt_ms,prompt_tps,eval_tokens,eval_ms,eval_tps,total_ms"
run_bench "default"
run_bench "ctx_2048" -c 2048
run_bench "ctx_4096" -c 4096
run_bench "ctx_8192" -c 8192
run_bench "ctx_16384" -c 16384
run_bench "ctx_32768" -c 32768

rm -rf "$LOG_DIR"
