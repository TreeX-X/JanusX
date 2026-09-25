---
schema: harness-note/1
id: 2ec6c79b-9310-494b-a1af-9d6ef95b62c4
kind: task
lifecycle: accepted
created: 2026-09-25
class: bug-fix
tags: [janus-chat, blueprint, island, gemini, tool-pairing]
relations:
  - type: implements
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/e7c03317-8bb8-4d1d-a1b2-832be6c5a3c5
    criteria: [AC-10]
work:
  scope:
    - repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
      paths: [src/renderer/src/components/janus/useJanusChat.ts, src/renderer/src/components/blueprint/BlueprintMaintenancePanel.tsx, src/renderer/src/components/blueprint/blueprint.css, tests/e2e/project-conversation.spec.ts, tests/e2e/island-harness/project.tsx, .agents/notes/]
  acceptanceRefs:
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/e7c03317-8bb8-4d1d-a1b2-832be6c5a3c5
      criterionId: AC-10
  verification:
    - id: V-1
      kind: command
      required: true
      repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
      cwd: .
      program: npm
      args: [run, typecheck]
---

# Island/blueprint dialog separation plus tool-pairing 400 recovery

## Goal

Two reported defects, one root-cause family. (1) Gemini 400 `function response parts != function call parts` after a few tool calls: the agent loop drops unexecuted sequential calls when steering preempts a batch, so the next request carries unpaired calls. (2) Island and blueprint dialogs share one island-active session: opening the blueprint hijacks the island, locks couple, and one poisoned history wedges both.

## Scope

Upstream root fix (janus-agentX `agent-core` loop): steering-preempted sequential calls now each ship a superseded placeholder result; preemption still stops execution, pairing never breaks. JanusX carries only hardening: `bindPanelProject` (no island hijack), panel conversations marked ephemeral (hidden from island lists, excluded from persistence, hence fresh after restart; the panel still clears on workspace switch), one auto-recovery turn on the pairing 400 (persisted history is plain text, so a fresh turn recovers; once per turn, matched narrowly), and a visible clear-context button in the blueprint header (minimal chrome otherwise keeps a single input).

`project-conversation.spec.ts` now asserts independence (separate ids/streams/locks, restart-fresh panel). The pre-separation `bindProject` path is untouched for other consumers.

## Acceptance criteria

- [x] AC-1: Steering mid-batch leaves every emitted call with exactly one result (upstream unit test); blueprint and island conversations hold different ids, streams, and locks.
- [x] AC-2: Panel history never persists (reload rebinds fresh); island lists never show the panel session; deleting island conversations never falls back to it.
- [x] AC-3: A pairing 400 triggers at most one automatic fresh-turn retry; any second failure stays a visible error with manual Retry.

## Verification

- janus-agentX `agent-core` loop suite: 11 PASS; `tsc --noEmit` clean (separate commit there).
- JanusX `tsc`: no errors in touched files (repo-wide run reports only pre-existing pruned-dep errors: `@ai-sdk/*`, `@electron-toolkit/utils`).
- JanusX `janus-chat-conversations` unit: PASS; `janus-resource-ui` fails to load on missing `@alloc/quick-lru` (pre-existing env breakage, type-only import of the touched hook).
- `check:notes`: 190 Notes, 0 errors.
- Playwright island E2E rewritten but not run in this sandbox (webServer port check fails).

## Alternatives considered

- Renderer-side steer suppression during tool execution: kills the designed steer-to-queue UX and still leaves the upstream hole for every other consumer; rejected in favor of the loop-level invariant plus a narrow auto-retry.
- Persisting the panel session: rejected per requirement (valid until restart/switch only); ephemerality also bounds poisoned-history blast radius to one dialog.
- Editing `node_modules` in place: rejected (npm `file:` copies); the loop fix lands in janus-agentX and flows in on version bump.

## Results

2026-09-25: separation + hardening landed here; loop pairing fix landed in janus-agentX with its unit test. Residual: `item_reference`-class gateway rejections are provider-side multi-turn translations JanusX never emits; if they recur, capture the full error text plus request turn number before changing anything.
