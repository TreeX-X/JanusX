---
{
  "schema": "harness-note/2",
  "id": "37a24b3c-ddab-42c8-a266-a08ad89df0de",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-21",
  "class": "bug-fix",
  "relations": [
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/c23ebb35-2d89-4c56-8dee-03bb7e277a22"}
  ],
  "extensions": {
    "r5Migration": {
      "sourceHash": "5d3143763f8715468389397e0b8e9002d533a7f91a9b45d009b2da5faed300e4",
      "repairs": ["relations[0].reason"],
      "originalRelations": [
        {
          "type": "related-to",
          "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/c23ebb35-2d89-4c56-8dee-03bb7e277a22",
          "reason": "Black-screen crash from worktree selectors"
        }
      ]
    },
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-21-agent-note-stable-refs-for-keyed-zustand-selectors--37a24b3c.md",
      "sourceHash": "7012fdcbe48afa63b80c89040572e79daa5bdce710fde431230da92d2b94c6a8",
      "originalBodyHash": "0424a9646e126ae982a446b982297744ff9569fc7049c28754db0890b7b2404d",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Stable refs for keyed zustand selectors. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/bug-fix/2026-09-21-worktree-selector-stability.md",
        "sourceHash": "7012fdcbe48afa63b80c89040572e79daa5bdce710fde431230da92d2b94c6a8",
        "originalBodyHash": "0424a9646e126ae982a446b982297744ff9569fc7049c28754db0890b7b2404d"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/dc1aca7c-408f-406d-add4-ba78d556b662"
}
---

# Stable refs for keyed zustand selectors

## Problem

Opening `npm run dev` showed a black window. The renderer console carried a getSnapshot warning plus a maximum-update-depth crash from `WorktreeSubList`: selectors like `useWorktreeStore((s) => s.worktreesByWorkspace[id] ?? [])` allocate a fresh array per snapshot, so every store update re-rendered, every render refetched, and React unmounted the tree. Expanding any workspace reproduced it; the main process stayed healthy throughout.

## Decision

Keyed-map selectors fall back to module-level empty constants (`EMPTY_WORKTREE_LIST`, `EMPTY_STRING_LIST`, `EMPTY_PENDING_LIST`) exported from the worktree store, keeping snapshot referential equality across renders. A unit check scans the sidebar, session panel, and store sources rejecting inline `?? []` inside worktree selectors, so the pattern cannot return silently.

## Alternatives considered

- `useMemo` per selector call site — strongest case is local containment with no shared constants. The driver that rules it out is coverage: every call site needs its own memo, and a missed one reintroduces the crash, while one constant fixes all sites.
- `useShallow` equality on selectors — strongest case is idiomatic zustand. The driver that rules it out is granularity: shallow still re-renders on unrelated map changes, and stable refs subsume it.
- Do nothing / reuse — keep inline fallbacks. The cost is a crash on every workspace expansion.

## Consequences

- **Gains**: cold boot renders with zero update-depth warnings; expanding workspaces with linked checkouts no longer crashes. The selector-shape check runs with the unit suite; project typecheck and touched-file lint pass.
- **Costs and limits**: the rule covers worktree selectors only; other keyed stores need the same audit when they grow map-valued slices. Built-app Electron acceptance was not exercised here.
