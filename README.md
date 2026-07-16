# Miagi

Qwen plans a lazy edit → FastEdit merges it into the selection.

Edit `PLANNER` / `APPLY` at the top of `apps/extension/src/extension.ts`.

## Servers (two processes)

```bash
# planner — English → lazy snippet
llama serve \
  -m ~/.cache/huggingface/hub/models--Qwen--Qwen2.5-Coder-1.5B-Instruct-GGUF/snapshots/f86cb2c1fa58255f8052cc32aeede1b7482d4361/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf \
  --port 8081 -a qwen

# apply — snippet → merged code
llama serve \
  -m ~/.cache/huggingface/hub/models--continuous-lab--FastEdit/snapshots/4d33d949985a0c21b945fd4a747cb8e2f12fd45f/gguf/fastedit-1.7b-Q8_0.gguf \
  --port 8080 -a fastedit
```

## Extension

```bash
cd apps/extension && bun run watch
```

Then F5 → **Run Miagi**. Select code → **Miagi: FastEdit**.
