---
schema: harness-note/1
id: 62676495-9b5f-4ec1-9460-f4d8f726f676
kind: decision
lifecycle: implemented
created: 2026-09-21
class: bug-fix
relations:
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/c23ebb35-2d89-4c56-8dee-03bb7e277a22
    reason: Duplicate main rows and avatar restyle
---

# Agent Note: Worktree path normalization and hover avatar

## Problem

Every workspace listed its main checkout twice. Git prints worktree paths with forward slashes while the workspace registry keeps native separators, so the main-row filter compared two spellings of the same directory and never matched. Separately, always-on repo avatars crowded multi-workspace sidebars with boxed images that competed against the file tree.

## Decision

All worktree path comparisons go through a normalized form that resolves separators, symlinks, and subst drives with case folding on Windows, with linked entries rewritten to native paths once at listing time so renderer keys, active-path checks, and metadata lookups share one spelling. A real-git regression test locks the lone-checkout count. Row icons rest on the borderless folder glyph; the cached avatar crossfades in over it on row hover only, reusing the existing group-hover reveal, and missing avatars never swap.

## Alternatives considered

- Normalize inside the parser — strongest case is one fixed point. The driver that rules it out is layering: parsing stays byte-faithful for diagnostics while comparison owns filesystem semantics.
- Avatar toggle in settings — strongest case is explicit user control. The driver that rules it out is default quality: hover reveal needs no preference to stay quiet.
- Do nothing / reuse — keep duplicated mains and permanent avatars. The cost is a phantom row per workspace and a noisy rail.

## Consequences

- **Gains**: lone checkouts list exactly once with native paths end to end; sidebars rest on folders with avatars one hover away. Unit coverage spans normalization, lone and linked listings, plus typecheck and touched-file lint.
- **Costs and limits**: case folding assumes case-insensitive filesystems on Windows only; exotic mount behavior still falls back to raw comparison. Built-app Electron acceptance was not exercised here.
