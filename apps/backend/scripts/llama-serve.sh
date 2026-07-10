#!/usr/bin/env bash
# Serve Qwen 3B — fits on a ~4 GB GPU alongside FastEdit (use -c 2048, not 8192).
set -euo pipefail

: "${LLM_HF_REPO:=Qwen/Qwen2.5-Coder-3B-Instruct-GGUF:Q4_K_M}"
: "${LLM_FIT_TARGET_MB:=256}"
: "${LLM_FIT_CTX:=2048}"
: "${LLM_CTX_SIZE:=2048}"
: "${LLM_THREADS:=8}"
: "${LLM_HOST:=127.0.0.1}"
: "${LLM_PORT:=8080}"

exec llama serve \
  --jinja \
  -hf "$LLM_HF_REPO" \
  -fitt "$LLM_FIT_TARGET_MB" \
  -fitc "$LLM_FIT_CTX" \
  -c "$LLM_CTX_SIZE" \
  -t "$LLM_THREADS" \
  -tb "$LLM_THREADS" \
  -ctk q8_0 \
  -ctv q8_0 \
  --flash-attn on \
  --host "$LLM_HOST" \
  --port "$LLM_PORT"
