---
{
  "schema": "harness-note/2",
  "id": "d0720a3c-13f0-5cc0-9a16-d509e755ef47",
  "kind": "decision",
  "lifecycle": "proposed",
  "created": "2026-09-22",
  "class": "architecture",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-22-agent-note-external-session-transcript-backfill--d0720a3c.md",
      "sourceHash": "88c5e59370c7f2f2433ae0e891b63a321dcfc9c6876c2e56098db925a288e83a",
      "originalBodyHash": "09c821701d3902f93b60b71e737fcd33dc2bce4442f25dc6906e7009c7aebb41",
      "category": "formal",
      "reason": "Retains the source decision in proposed lifecycle; body documents External Session Transcript Backfill. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix","Removed lifecycle duplicated by frontmatter"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/proposed/architecture/2026-09-22-external-session-transcript-backfill.md",
        "sourceHash": "9b37920558e629552e0b6e6d46a47e471fbb6b56947e22fd3692807460df3006",
        "originalBodyHash": "339df3c96e31ae3fb2a0e12b0d7b77ef2f5731651921268989566b0f21cfbcc1"
      }
    }
  },
  "updated": "2026-10-08T09:06:56.496Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/0cb931e1-e33c-4e38-a9d9-9d652796d935"
}
---
# External Session Transcript Backfill


## Problem

JanusX SessionPanel shows zero sessions when Claude Code / Codex sessions were started outside JanusX (plain external terminals). Session creation depends exclusively on hook traffic delivered to JanusX (`JANUSX_HOOK_PORT` / `JANUSX_HOOK_TOKEN` are injected per-PTY only for shells launched by JanusX — `terminal-handlers.ts` env injection). External terminals never receive that env, so their hooks never reach JanusX; `AgentHookCoordinator.resolveTerminal` matches only already-registered terminal ids and returns early on unmatched input, so no `createSession` call ever happens (`createSession` has exactly two call sites, both inside JanusX-launched terminal flows).

Result: provider session transcripts on disk (`~/.claude/projects/**/*.jsonl`, `~/.codex/sessions/**/*.jsonl`) are invisible to SessionPanel, and resume/inspect workflows for externally-started sessions cannot be started from JanusX.

## Decision

Add a pull-mode backfill that discovers provider transcript files on disk and imports them as external sessions, following the same approach already deferred by the orca terminal-acquisition work: the tool reads provider-native transcript stores directly, without requiring hook traffic or a registered terminal.

1. **Capabilities (`agent-engine-capabilities.ts`)** — extend each engine capability with a `sessionStore` resolver (null for engines without a native transcript directory):
   - Claude: `CLAUDE_CONFIG_DIR/projects` when set, else `~/.claude/projects`
   - Codex: `CODEX_HOME/sessions` when set, else `~/.codex/sessions`
2. **Scanner (`src/main/sessions/external-session-scanner.ts`, new)** — walk each configured `sessionStore`, parse every `*.jsonl`, extract `sessionId`, `cwd`, first user prompt, tail assistant excerpt, and turn count, then call `sessionRegistry.importExternalSession(...)` with per-`providerSessionId` de-duplication so repeat scans never create duplicates.
3. **Registry (`session-registry.ts`)** — add `importExternalSession()` for sessions that have no live shell (`terminalId` undefined) and mark them `external: true` in `AgentSessionSummary`; relax cwd filtering in `listSessions` from exact equality to prefix/containment so imported sessions surface under the current workspace even when their recorded `cwd` is a subdirectory or a symlink-resolved variant.
4. **Scan triggers (`session-handlers.ts`)** — run one backfill pass at boot (after `SessionRegistry.load()`) and a debounced re-scan when SessionPanel opens; optional `fs.watch` on the store roots can be added later without changing the import API.
5. **UI (`SessionPanel.tsx` + terminal i18n locales)** — render an "external" badge on imported sessions; disable or degrade the continue button when the session has no backing shell/command to resume into, and add the corresponding zh-CN / en i18n keys.

Hook-based live updates remain the source of truth for sessions owned by JanusX terminals; backfill only seeds sessions that would otherwise stay invisible.

## Alternatives considered

- **Inject hook env into externally-started shells** — requires JanusX to own or wrap the user's shell startup path; cannot cover already-running or independently-launched terminals, and forces coupling to shell rc files.
- **Listen to provider transcript files with fs.watch only** — watch events fire on every keystroke-sized append and would rebuild excerpts continuously; a boot pass plus debounced panel-open scan gives the same visibility with far less I/O, and watch can be layered on later.
- **Register an unmatched-session path in `AgentHookCoordinator.resolveTerminal`** — only helps if hook traffic exists; external terminals produce none, so this changes nothing for the reported bug.
- **Export sessions out of the providers (claude/codex CLI export)** — adds a CLI subprocess dependency and version-sensitive output parsing; reading the JSONL store directly is stable and already proven by the orca transcript approach.

## Acceptance criteria

- AC-1: With Claude Code started in a terminal outside JanusX, opening SessionPanel lists that session with an "external" badge, correct cwd, first user prompt, and a non-empty tail excerpt.
- AC-2: The same holds for an externally-started Codex session under its native sessions directory; engines without a `sessionStore` (opencode, pi) are skipped without errors.
- AC-3: Re-running the scanner (boot + repeated panel opens) never creates duplicate rows for the same `providerSessionId`.
- AC-4: A session whose recorded `cwd` is a child of (or resolves into) the current workspace root still appears under that workspace's session filter.
- AC-5: Continue/resume is disabled or clearly degraded for external sessions that have no backing JanusX shell, while hook-owned sessions keep their existing continue behavior.
- AC-6: `npm run typecheck`, `npm run lint`, and the relevant unit suites (`external-session-scanner`, `agent-session-registry`, `agent-engine-capabilities`) pass.

## Consequences

- Large transcript trees (`~/.claude/projects` can accumulate many files) make a naive full walk slow; mitigate with bounded file count/size and by skipping files older than the active workspace when possible.
- Provider JSONL schemas may gain new event shapes; scanner must tolerate unknown record types and fall back gracefully rather than fail the whole scan.
- Symlinked or moved workspaces can make cwd matching ambiguous; the relaxed prefix/containment filter may surface sessions from sibling projects under the same root — acceptable trade-off, revisit if noisy.
- Imported sessions have no live shell, so any code path that assumes `terminalId` presence must be audited (continue button, timeline live updates) before enablement.
