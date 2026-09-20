# Agent Note: Share import applies snapshots per checkout

Status: implemented

## Problem

Share export produces a portable snapshot, but no path consumes it: twin checkouts of one repository cannot exchange notes except by hand-copying files, which drops identity, hashes, and receipts. Copying also risks silently overwriting the target's newer edits or forking a second writable truth beside the managed transaction. Cross-checkout work needs an import that compares by note identity, refuses conflicts loudly, and converges on retry.

## Decision

`planShareImport` in `src/main/harness/share-import.ts` plans one snapshot against the target index without moving bytes. Identity is the note id, never the file path: missing ids become creates with collision-free paths, matching hashes become identical skips, and anything else becomes an expected-hash replace. Notes whose prose fails validation quarantine as invalid items, and receipts with broken shapes do the same. Foreign-repo snapshots, non-share envelopes, and leaking text refuse the whole plan before anything is compared. `HarnessNoteService.applyShareImport` writes receipts first (immutable blobs: identical bytes are kept, divergent bytes under one id refuse as conflicts) and then lands the applicable notes in one managed transaction, so a concurrent edit fails the apply instead of half-applying it. Re-running converges because applied notes resurface as identical skips. The leak gate moved into the share module with its service re-export intact. The `shareImportPreview` and `shareImportApply` IPC channels, preload entries, renderer services, store actions, and the scope-bar picker with preview summary and per-outcome results close the interface loop.

## Alternatives considered

- Hand-copy files between checkouts: zero code, but identity, hashes, and receipts fall off, and nothing stops a silent overwrite of newer target edits.
- Parse the snapshot into direct file writes: fewer moving parts than the transaction, but bypasses journal recovery, idempotency keys, and expected-hash conflict detection that the managed path already owns.
- Apply note-by-note for finer partiality: reports per-note failures inside one checkout, but surrenders the atomicity that makes retry safe; partiality across checkouts with atomicity inside each one keeps both.
- Auto-resolve conflicts by newest timestamp: removes the retry step, but timestamps across machines are untrustworthy and last-writer-wins silently drops decisions; conflicts stay explicit.
- Do nothing / reuse — keep export-only sharing; rejected because twin checkouts then have no machine-checked path at all and operators fall back to copying.

## Consequences

- **Gains**: an export from one checkout previews and lands in its twin with per-note applied, identical, and invalid outcomes plus per-receipt applied, kept, invalid, and conflict outcomes. Verification: `tests/unit/harness-share-import.test.ts` (5 checks: empty-twin roundtrip, drift update with identical skips and retry convergence, receipt import with broken-shape refusal and no-overwrite, foreign-repo plus bad-envelope plus leak refusal, identity and prose quarantine). Neighboring harness suites stay green; typecheck passes and touched sources lint clean.
- **Costs and limits**: cross-repo snapshots refuse; only twin checkouts of one repo import. Creates prefer the source relative path and fall back to an imported directory on collision, so deep regrouping is best-effort rather than exact. A transaction-level race still fails the whole apply and asks for a re-preview. Panel and IPC entry points are follow-ups; cross-checkout orchestration across machines still travels through explicit export files, not live sync.
