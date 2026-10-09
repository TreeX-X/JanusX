---
{
  "schema": "harness-note/2",
  "id": "15a5d590-1224-5c2e-8a5a-0941429f10f1",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-07-05",
  "class": "architecture",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-07-05-agent-note-controlled-llm-tool-runtime--15a5d590.md",
      "sourceHash": "ff004d52435d9d414ce02b45962ecffcbfa8f0295d4eec54959544b12ee77e31",
      "originalBodyHash": "a6c85dc06022c9e67920a0c2f87e4f2cf939603764f1fe4e6728df7c883f170f",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Controlled LLM tool runtime. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix","Removed lifecycle duplicated by frontmatter"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/architecture/2026-07-05-llm-tool-runtime.md",
        "sourceHash": "ff004d52435d9d414ce02b45962ecffcbfa8f0295d4eec54959544b12ee77e31",
        "originalBodyHash": "a6c85dc06022c9e67920a0c2f87e4f2cf939603764f1fe4e6728df7c883f170f"
      }
    }
  },
  "updated": "2026-10-08T03:43:42.432Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/95ec5f71-33e3-4f71-aa05-d3e725c33b10"
}
---
# Controlled LLM tool runtime


## Problem

The chat link answers but cannot act. Models emit text while file, shell, and version-control capabilities sit behind human hands, so every multi-step task stalls on manual execution between turns.

## Decision

A host-owned runtime promotes the model from answerer to supervised actor. Models emit tool calls only; the shell executes through a policy gate, path guard, conflict detection, and audit store with approval boundaries intact. Permissions compose profiles, workspace roots, tools, and approval policy instead of a boolean switch, and read, write, shell, and version-control layers authorize separately. Turn and tool events stream to rich clients while external capabilities register through protocol extension rather than prompt hardcoding. The loop-level refactor continues in `2026-08-08-agent-loop-refactor.md`.

## Alternatives considered

- Direct system access for models — strongest case removes all plumbing. The driver that rules it out is blast radius: unmediated execution has no boundary to audit.
- Human copy-paste execution — strongest case needs no runtime at all. The driver that rules it out is throughput: every step waits on hands.
- Do nothing / reuse pure chat — staying put keeps the link simple. The cost is permanent manual execution between turns.

## Consequences

- **Gains**: Models complete file, command, and version-control tasks inside workspace sandboxes with structured results and full audit.
- **Costs and limits**: Every new capability needs a tool definition, a permission slot, and an approval mapping before models may call it.
