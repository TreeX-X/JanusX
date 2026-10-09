---
{
  "schema": "harness-note/2",
  "id": "bdced085-ceb8-441f-a4fc-48d6223b6257",
  "kind": "task",
  "lifecycle": "accepted",
  "created": "2026-10-08",
  "updated": "2026-10-08T09:06:56.496Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/bd612cd8-0676-4c46-98ba-81d1dc008505",
  "work": {
    "scope": [
      {
        "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
        "paths": [".agents/notes/","docs/migrations/","scripts/","src/","tests/","AGENTS.md",".codex/",".claude/"]
      }
    ],
    "acceptanceRefs": [
      {"uri":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/bdced085-ceb8-441f-a4fc-48d6223b6257","criterionId":"AC-1"},
      {"uri":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/bdced085-ceb8-441f-a4fc-48d6223b6257","criterionId":"AC-2"},
      {"uri":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/bdced085-ceb8-441f-a4fc-48d6223b6257","criterionId":"AC-3"}
    ],
    "verification": [
      {
        "id": "V-1",
        "kind": "command",
        "required": true,
        "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
        "cwd": ".",
        "program": "node",
        "args": ["scripts/verify-note-corpus.mjs"]
      }
    ],
    "review": "self"
  }
}
---

# Migrate JanusX legacy Notes to maintained modules

## Scope

Main Agent migrates the inventoried clean Notes into existing module responsibilities before final corpus validation. Preserve UUID and created, repair links and reverse comments, remove redundant embedded backups only with exact Git provenance. The three dirty knowledge Notes remain byte-for-byte protected. No subagent may modify this Task.

## Acceptance criteria

- [x] AC-1: Every original source has an identity, raw hash, target or exact protected exclusion and disposition.
- [x] AC-2: Maintained documents use six v2 kinds, stable names, valid ownership and updated timestamps; historical Task evidence is not reissued.
- [x] AC-3: Shared parser and index checks pass after migration, with local references repaired and protected legacy sources reported separately.

## Verification

V-1 passes after migration. Shared parser, module structure, identities, creation dates and local references are checked; exact protected-source hashes match. No independent review is required by this migration Task.

## Progress

Migration implementation is complete: 254 of 257 inventoried sources now use maintained module directories; three pre-existing dirty knowledge Notes remain protected byte-for-byte. Nine module entries retain existing identities. Main repaired ownership, relative paths, reverse comments and sixteen historical AC heading links. No historical receipt was reissued.

## Evidence

[Migration accounting](../../../../../docs/migrations/note-v2.json) records exact original sources and dispositions. [Verification evidence](../../../../../docs/migrations/workflowx-v2-verification.md) records commands and results. Three relative links in protected files remain explicit deferrals; their migrated destinations exist.

## Handoff

Main Agent completed the authorized migration and self-review. Continue the cross-repository adoption Task with runtime evidence and independent final review; no migration step remains for the clean corpus. Resume the three protected knowledge Notes only when their existing edits are ready to integrate. This summary is not a runtime receipt.
