# Agent Note: Compressed handoff briefs for desktop reviews

Status: implemented

## Problem

Desktop review prompts used to concatenate raw thread history onto precise
evidence: every repair appended full attempt records, file refs traveled
beside the manifest without an integrity check, and nothing capped the
handoff size. The agentX
brief/spawn design,
[janus-agentX 2026-09-08](../../../../../janus-agentX/.agents/notes/proposed/feature/2026-09-08-context-brief-task-spawn.md),
requires the opposite: a fixed, capped brief with code-joined file refs that
no model layer rewrites, while full logs never flow back.

## Decision

`src/main/harness/task-brief.ts` builds the handoff brief purely from live
data: goal and constraints from the task Note, criteria ids, manifest file
refs joined code-side, and condensed prior attempts. Caps bind goal text,
constraint text, and file count; overflow flips an explicit truncated marker
instead of silently dropping content. `verifyBriefFiles` re-validates every
ref against the tested manifest before the review runs, so moved or vanished
files refuse with `STALE_BASELINE`. One audit copy lands per attempt next to
the thread. The review prompt carries the brief as the summary track beside
the exact track of manifest, checks, and criterion hashes; the raw history
section is gone.

## Alternatives considered

- Keep appending raw history: zero new code, but unbounded growth and no
  ref integrity; the brief replaces it at the same call site.
- Let the model summarize its own context: fewer bytes on paper, but hashes
  and paths drift under rewriting and the brief/spawn design forbids exactly
  this; the builder here has no model call at all.
- Persist briefs as shared Notes: auditability for free, but briefs are
  per-attempt run records and `.local` audit copies keep them out of the
  shared graph.
- Do nothing / reuse: keep history拼接; rejected because long repair chains
  pay re-read costs the persistent-thread direction was created to remove.

## Consequences

- **Gains**: repairs hand a fixed-shape, capped brief to the reviewer with
  refs the kernel re-checks; determinism holds because the builder is pure.
  Builder caps, truncation markers, ref refusal, audit copies, and prompt
  wiring carry unit coverage alongside the reattachment suite.
- **Costs and limits**: the brief summarizes at most three prior attempts
  and forty files; deeper archaeology still reads receipts and Notes. Goal
  and constraint text follow the Scope and Open questions sections, so tasks
  that hide intent elsewhere brief thinly. Full subagent spawn with isolated
  loops stays with the delegated-review block; this slice covers the review
  handoff only.
