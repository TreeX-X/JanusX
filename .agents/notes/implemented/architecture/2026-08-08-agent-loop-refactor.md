# Agent Note: Policy-neutral agent loop refactor

Status: implemented

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
