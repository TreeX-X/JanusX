---
{
  "schema": "harness-note/2",
  "id": "33f0f481-52fd-5672-b546-6c1c4d7689ed",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-08-08",
  "class": "architecture",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-08-08-agent-note-policy-neutral-agent-loop-refactor--33f0f481.md",
      "sourceHash": "c5e9242c1ef8c92d4b52b7c847358da2656260083f37a5f3f6289d7ba8b18b82",
      "originalBodyHash": "60efe6574d9e459e66eebb1d4690bd8b6d819f244f3d9108abd0f580cc7b5904",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Policy-neutral agent loop refactor. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix","Removed lifecycle duplicated by frontmatter"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/architecture/2026-08-08-agent-loop-refactor.md",
        "sourceHash": "c5e9242c1ef8c92d4b52b7c847358da2656260083f37a5f3f6289d7ba8b18b82",
        "originalBodyHash": "60efe6574d9e459e66eebb1d4690bd8b6d819f244f3d9108abd0f580cc7b5904"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/95ec5f71-33e3-4f71-aa05-d3e725c33b10"
}
---
# Policy-neutral agent loop refactor


## Problem

One handler carries the entire chat turn: model calls, tool assembly, knowledge injection, approval fallback, and observation writes fused into a single long routine. Every behavior change risks every other behavior because layers share no boundary.

## Decision

The turn splits into a policy-neutral loop core with hooks for strategy, knowledge, and traces, capability tools beneath, and session persistence alongside. The orchestrator keeps shell-side duties only: lifecycle arbitration, steering registration, recovery, and empty-reply handling. Turn semantics live in the agent package behind a single entry with twin tests guarding each shell change. The runtime that this loop drives arrived earlier in `2026-07-05-llm-tool-runtime.md`.

## Alternatives considered

- Keep the fused handler with internal sections — strongest case avoids all migration risk. The driver that rules it out is blast radius: each edit still endangers unrelated behaviors.
- Framework adoption wholesale — strongest case imports a proven harness. The driver that rules it out is fit cost: foreign session, tool, and approval models bend the shell around them.
- Do nothing / reuse the long routine — staying put ships features fastest this week. The cost is compounding untouchability with every added concern.

## Consequences

- **Gains**: Loop, hooks, tools, and sessions evolve independently with twin tests pinning shell behavior.
- **Costs and limits**: Cross-layer changes now touch several small units instead of one place; hook ordering carries implicit semantics newcomers must learn.
