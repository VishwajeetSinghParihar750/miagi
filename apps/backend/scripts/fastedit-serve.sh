#!/usr/bin/env bash
# Serve FastEdit 1.7B for merging lazy code_edit snippets.
# GGUF lives in a subfolder — use -hff, not repo:path syntax.
# Keep -c 2048 so both models can share a ~4 GB GPU with Qwen 1.5B.
set -euo pipefail

: "${APPLY_LLM_HF_REPO:=continuous-lab/FastEdit}"
: "${APPLY_LLM_HF_FILE:=gguf/fastedit-1.7b-Q8_0.gguf}"
: "${APPLY_LLM_FIT_TARGET_MB:=256}"
: "${APPLY_LLM_FIT_CTX:=2048}"
: "${APPLY_LLM_CTX_SIZE:=2048}"
: "${APPLY_LLM_THREADS:=8}"
: "${APPLY_LLM_HOST:=127.0.0.1}"
: "${APPLY_LLM_PORT:=8081}"

exec llama serve \
  --jinja \
  -hf "$APPLY_LLM_HF_REPO" \
  -hff "$APPLY_LLM_HF_FILE" \
  -fitt "$APPLY_LLM_FIT_TARGET_MB" \
  -fitc "$APPLY_LLM_FIT_CTX" \
  -c "$APPLY_LLM_CTX_SIZE" \
  -t "$APPLY_LLM_THREADS" \
  -tb "$APPLY_LLM_THREADS" \
  -ctk q8_0 \
  -ctv q8_0 \
  --flash-attn on \
  --host "$APPLY_LLM_HOST" \
  --port "$APPLY_LLM_PORT"
