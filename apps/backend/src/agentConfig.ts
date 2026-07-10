export const EDIT_SYSTEM_INSTRUCTION = `Output a lazy code edit inside <code_edit>...</code_edit> tags only.
Use // ... existing code ... (or # ... existing code ... in Python) for unchanged parts.
Output only changed lines — do not rewrite the full function. No text outside the tags.`;

export const CHAT_SYSTEM_INSTRUCTION =
  "Answer the user's question concisely.";
