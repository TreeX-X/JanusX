---
{
  "schema": "harness-note/2",
  "id": "2ec6c79b-9310-494b-a1af-9d6ef95b62c4",
  "kind": "task",
  "lifecycle": "accepted",
  "created": "2026-09-25",
  "parent": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/e7c03317-8bb8-4d1d-a1b2-832be6c5a3c5",
  "class": "bug-fix",
  "tags": ["janus-chat","blueprint","island","gemini","tool-pairing"],
  "relations": [
    {
      "type": "implements",
      "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/e7c03317-8bb8-4d1d-a1b2-832be6c5a3c5",
      "criteria": ["AC-10"]
    }
  ],
  "work": {
    "scope": [
      {
        "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
        "paths": [
          "src/renderer/src/components/janus/",
          "src/renderer/src/components/blueprint/BlueprintMaintenancePanel.tsx",
          "src/renderer/src/components/blueprint/blueprint.css",
          "src/renderer/src/i18n/",
          "scripts/patch-agent-note-tools.mjs",
          "scripts/patch-agent-tool-pairing.mjs",
          "tests/unit/janus-tool-pairing.test.ts",
          "tests/e2e/blueprint-chat-recovery.spec.ts",
          "tests/e2e/project-conversation.spec.ts",
          "tests/e2e/island-harness/project.tsx",
          ".agents/notes/"
        ]
      }
    ],
    "acceptanceRefs": [
      {"uri":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/e7c03317-8bb8-4d1d-a1b2-832be6c5a3c5","criterionId":"AC-10"}
    ],
    "verification": [
      {
        "id": "V-1",
        "kind": "command",
        "required": true,
        "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
        "cwd": ".",
        "program": "npm",
        "args": ["run","typecheck"]
      }
    ],
    "review": "independent"
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/f12d99b4-c116-48dc-96d9-e3ac74ae41cd"
}
---

# Island/blueprint dialog separation plus tool-pairing 400 recovery

## Goal

Two reported defects, one root-cause family. (1) Gemini 400 `function response parts != function call parts` after a few tool calls: the agent loop drops unexecuted sequential calls when steering preempts a batch, so the next request carries unpaired calls. (2) Island and blueprint dialogs share one island-active session: opening the blueprint hijacks the island, locks couple, and one poisoned history wedges both.

## Scope

The agent loop must pair every emitted call with one result, including sequential calls skipped when steering arrives during parallel execution or between sequential calls. Provider conversion must also group adjacent tool results into one tool message: Google/Vertex interprets separate result messages as separate response turns, even when total call/result counts match. User and assistant messages remain boundaries; grouping never repeats execution or modifies source history. JanusX applies both invariants to the installed agent through `scripts/patch-agent-tool-pairing.mjs`, imported by the existing install/dev/build/unit-test patch entry. The patch is idempotent and rejects an unrecognized insertion point; its regression tests execute the installed runtime. Review and remove this compatibility patch when the pinned agent package implements both invariants.

JanusX uses `bindPanelProject` to keep island and blueprint sessions independent. Panel conversations are ephemeral: hidden from island lists, excluded from persistence, and cleared on workspace switch. The blueprint header provides a clear-context button.

Pairing errors receive at most one automatic recovery per user request. Recovery eligibility belongs to the request closure, so starting the recovery cannot reset its budget. Only attempts with no tool execution or known replay-safe Note list/read/focus/scope tools qualify. Writes, unknown tools, Note change receipts, and newer user instructions suppress automatic replay. The side-effect guard covers the whole attempt independently of the eight-card display window. Manual Retry and new user requests receive a fresh budget.

Automatic recovery retains the logical start time, partial assistant messages, tool traces, and current tool activities. Both chat surfaces display the recovery count and provider error until the resumed request produces text, reasoning or actionable tool progress; an agent-start event alone does not dismiss the notice. A second failure remains visible with recent tool cards even if the model emitted no assistant text. Successful recovery clears the error; stop and clear invalidate the active generation. Recovery starts synchronously from the error callback without an orphan retry timer. The replay-safe allowlist is deliberately narrow: adding a tool requires establishing that re-execution cannot repeat external changes.

`project-conversation.spec.ts` now asserts independence (separate ids/streams/locks, restart-fresh panel). The pre-separation `bindProject` path is untouched for other consumers.

## Acceptance criteria

- [x] AC-1: Steering mid-batch leaves every emitted call with exactly one result (upstream unit test); blueprint and island conversations hold different ids, streams, and locks.
- [x] AC-2: Panel history never persists (reload rebinds fresh); island lists never show the panel session; deleting island conversations never falls back to it.
- [x] AC-3: An eligible pairing 400 triggers at most one automatic fresh-turn retry; any second failure stays a visible error with manual Retry. Recovery preserves elapsed time and tool visibility; attempted writes and newer user instructions prevent automatic replay.

## Verification

2026-10-02 regression evidence:

- Provider grouping and automatic highlighting: `npm run test:unit -- --run tests/unit/google-tool-pairing.test.ts tests/unit/janus-tool-pairing.test.ts tests/unit/note-chat.test.ts tests/unit/note-focus.test.ts tests/unit/project-chat-context.test.ts`: 37 passed. The Google SDK test captures actual serialized requests through a local mock fetch: two calls produce one two-result response turn and one write execution. Both grouping tests fail before the compatibility patch. No live provider credentials or requests are used.
- `npm run test:e2e -- tests/e2e/blueprint-chat-recovery.spec.ts tests/e2e/blueprint-note-focus.spec.ts tests/e2e/blueprint-maintenance.spec.ts tests/e2e/project-conversation.spec.ts --workers=1`: 21 passed, including dismissing the recovery error on resumed output and checking computed node outline styles.

- `npm run test:unit -- --run tests/unit/janus-tool-pairing.test.ts tests/unit/janus-chat-conversations.test.ts tests/unit/janus-chat-status.test.ts tests/unit/janus-runtime-state.test.ts tests/unit/note-chat.test.ts`: 39 passed. The parallel steering case fails before the patch with only the read result and passes with exactly one result for each emitted call.
- `npm run typecheck:strict-unused` and `npm run i18n:check`: passed.
- `npm run test:e2e -- tests/e2e/blueprint-chat-recovery.spec.ts tests/e2e/project-conversation.spec.ts tests/e2e/blueprint-note-focus.spec.ts tests/e2e/blueprint-maintenance.spec.ts --workers=1`: 20 passed with localhost proxy bypass. Eight recovery cases cover the retry bound, monotonic time, tool visibility, writes beyond the visible window, stop, clear, newer instructions, unknown tools, successful recovery, and failure without assistant text.
- `npm run build:check`: passed. Focused ESLint on `JanusChat.tsx` and `useJanusChat.ts`: zero errors, four existing translation warnings. `check:notes`: six existing errors in `dsh-integration.md`; the owning Note has zero errors.
- Browser verification uses injected agent events in the real blueprint chat fixture; it does not establish the originating error for a live provider session.

Historical 2026-09-25 evidence (the parallel-to-sequential boundary and retry-budget reset are not covered by these checks):

- janus-agentX `agent-core` loop suite: 11 PASS; `tsc --noEmit` clean (separate commit there).
- JanusX `tsc`: no errors in touched files (repo-wide run reports only pre-existing pruned-dep errors: `@ai-sdk/*`, `@electron-toolkit/utils`).
- JanusX `janus-chat-conversations` unit: PASS; `janus-resource-ui` fails to load on missing `@alloc/quick-lru` (pre-existing env breakage, type-only import of the touched hook).
- `check:notes`: 190 Notes, 0 errors.
- Playwright island E2E rewritten but not run in this sandbox (webServer port check fails).

## Alternatives considered

- Renderer-side steer suppression during tool execution: kills the designed steer-to-queue UX and still leaves the upstream hole for every other consumer; rejected in favor of the loop-level invariant plus a narrow auto-retry.
- Persisting the panel session: rejected per requirement (valid until restart/switch only); ephemerality also bounds poisoned-history blast radius to one dialog.
- Untracked edits to `node_modules`: rejected because npm `file:` copies discard them. The tracked compatibility script reproduces the missing installed-runtime fix until the dependency includes it.
- Reusing the resetting retry flag or retrying every failed tool request: requires less state but permits unbounded requests or duplicate writes. The request-scoped recovery argument and conservative tool allowlist bound both effects.

## Results

2026-09-25: separation + hardening landed here; loop pairing fix landed in janus-agentX with its unit test. Residual: `item_reference`-class gateway rejections are provider-side multi-turn translations JanusX never emits; if they recur, capture the full error text plus request turn number before changing anything.

2026-10-02: the mixed parallel/sequential steering reproduction confirms a missing boundary result; browser event injection confirms that the resettable guard permits repeated recovery requests. The installed-loop patch and request-scoped recovery cover these cases. Live provider verification remains outside the fixture evidence.

## Progress

Historical delivery statements remain in this document; no v2 execution receipt is asserted.

## Evidence

Original source: Git e433bb8627150126b782a301352da05e2149c18b:.agents/notes/2026-09-25-blueprint-dialog-separation--2ec6c79b.md. See docs/migrations/note-v2.json for the raw-source hash and historical execution.

## Handoff

Main Agent owns this Task. Reassess scope, fixed acceptance sources and verification before any new run. Preserve independent-review obligations; subagents read only.
