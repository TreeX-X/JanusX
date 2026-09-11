# Agent Note: Controlled LLM tool runtime

Status: implemented

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
