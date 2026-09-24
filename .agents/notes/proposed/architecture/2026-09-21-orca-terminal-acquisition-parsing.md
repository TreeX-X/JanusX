# Agent Note: Orca terminal-type acquisition and event parsing, source-verified

Status: proposed

## Problem

JanusX tracks turns through pty heuristics plus checkpoint snapshots, which leaves per-turn agent prose and provider session identity unreachable (recorded as the revisit signal in the session-checkpoint migration note). An earlier analysis of orca derived its acquisition mechanism from local userData alone. The orca repository is open source (`https://github.com/stablyai/orca`, MIT), so the mechanism below is verified against a shallow clone taken 2026-09-21 plus the installed build's `%APPDATA%/orca` state; every claim carries the file that proves it.

## Findings

Orca's stability formula is capability files plus PATH probing plus injected identity plus engine-native hook events plus per-engine normalization plus transcript reads plus backfill. Pty text never participates in attribution or state decisions; it is retained only as raw record.

### Type acquisition: registry, probing, launch

- `src/shared/tui-agent.ts` declares the `TuiAgent` union (~37 ids: claude, codex, opencode, opencode2, pi, omp, gemini, kiro, hermes, among others).
- `src/shared/tui-agent-config.ts` (`TUI_AGENT_CONFIG`) is the per-agent capability file: `detectCmd` with aliases, required commands, and unsupported runtimes; `launchCmd` with per-platform overrides; `expectedProcess`; `promptInjectionMode`; plus quirk fields (`argvPromptSeparator`, `preflightTrust`, `draftPasteReadySignal`, `submitRetryDelayMs`, `submitLineSettleMsPerLine`, Windows newline bindings per agent).
- `src/shared/tui-agent-detection-commands.ts` probes by PATH lookup (`resolveDetectedTuiAgentIds`); only claude reports a version (`managed-hook-detection-commands.ts` plus `parseClaudeCliVersion`). Stability does not depend on version comparison.
- `src/shared/tui-agent-startup.ts` folds the first prompt per injection mode (argv `--prefill` for claude/openclaude, `--prompt` flags for opencode, env prefill `ORCA_PI_PREFILL`/`ORCA_OMP_PREFILL`, stdin paste-after-start as followup).
- PTY spawn (`src/main/ipc/pty/runtime/spawn-options.ts`, `src/main/ipc/pty/ipc/spawn-env.ts:121-132`) injects identity env into every pane: `ORCA_PANE_KEY` (`tabId:leafUUID`, see `src/shared/stable-pane-id.ts:22-45`), `ORCA_TAB_ID`, `ORCA_WORKTREE_ID`, `ORCA_AGENT_LAUNCH_TOKEN`; per-agent hook and plugin overlays assemble in `src/main/ipc/pty/host-env/assembly.ts:39-80`.

### Event parsing: hooks, normalization, transcripts, backfill

- Receiver `src/main/agent-hooks/server/server-lifecycle.ts:57-175` listens on loopback with a dynamic port published through an endpoint file, checks `X-Orca-Agent-Hook-Token`, and fails open with 204; a relay twin lives in `src/relay/agent-hook-server.ts:156-304`. Routes cover 19 engines (`src/shared/agent-hook-listener/source-routing.ts:5-25`); bodies accept raw JSON or form with a 1MB cap (`request-body.ts:33-123`).
- Shims are per engine: POSIX `hook-post-command.ts:4-37` and Windows `installer-utils.ts:162-201`; claude installs nine hook classes into `~/.claude/settings.json` (`hook-service.ts:60-112`, `hook-settings.ts:39-100`: SessionStart, UserPromptSubmit, Stop, StopFailure, SubagentStart/Stop, TeammateIdle, Pre/PostToolUse, PermissionRequest, PostCompact); opencode contributes a plugin (`hook-service.ts:55-67`, `SessionStart{sessionID}`, `MessagePart{role,text,messageID,sessionID}`). Shims never block the agent: sub-second curl timeouts, no-op when env is missing, stdin drained, and the claude shim additionally suppresses nested invocations (`CLAUDE_JOB_DIR`) and foreign harnesses (`GROK_HOOK_EVENT`, `DEVIN_PROJECT_DIR`).
- Normalization entry `src/shared/agent-hook-listener.ts:27-213` validates the envelope, extracts prompt, session, and transcript refs, and dispatches per engine (`provider-dispatch.ts:51-152`): claude maps SessionStart/UserPromptSubmit/Pre/PostToolUse to working, PermissionRequest to waiting, Stop to done, with lead-versus-child rosters by `agent_id` (`providers/claude-events.ts:27-315`); codex mirrors it and reconciles `transcript_path` (`providers/codex-events.ts:135-241`).
- Transcripts are read tail-only at hook time (`transcript-reader.ts:12-83`, backward 64KB chunks, 4MB cap); full history resolves separately (`main/native-chat/transcript-tail-reader.ts:36-79`, `session-file-resolver.ts:39-62,68-80`: claude via `CLAUDE_CONFIG_DIR` under `~/.claude/projects`, codex via managed home then `CODEX_HOME`, with the hook-supplied `transcriptPath` authoritative because UUID filenames do not match).
- Durability is layered: `last-status.json` persistence plus launch-token-fenced spool replay (`server-persistence.ts:17-62`, `server-hydration.ts:26-171`, `server-ingest-remote.ts:99-105`); codex sessions backfill independently (`main/codex/codex-session-backfill.ts:57,176-217`, audit ledger, `thread/read` index healing); pane-to-`CODEX_HOME`/account pins live in `codex-pane-accounts.json` (`codex-pane-account-registry.ts:21-36`).
- Authority closes the loop: launch tokens hash to per-pane evidence (`server-authority-evidence.ts:74-93`), and retired/closed-tab suppression plus new-turn rebinding decide accept, restart, or suppress (`server-status-disposition.ts:43-152`).

Local cross-check: the installed build's `%APPDATA%/orca` shows the same mechanism running — `agent-hooks/endpoint.cmd` (port, token, `raw-json-v1`), `last-status.json` v2 with `authorityCommitments`, `terminal-history/<pane>::<cwd>@@<hash>/{meta.json,output.log,checkpoint.json}`, and `codex-pane-accounts.json` with host selection keys.

## Proposal

Borrow the pattern, not the code, against JanusX contracts when the transcript-content revisit lands:

- Hook layer per preset (claude settings hooks, codex config hooks, opencode plugin hooks) posting to a loopback receiver with token auth and fail-open timeouts; land in the session/terminal main process beside the existing IPC channels.
- Pane identity injection at terminal spawn (`paneKey`, launch token, worktree id) so hook events attribute without pty parsing; pty stays the fallback record only.
- Per-engine normalizers mapping native event names to the existing six terminal states; engine differences live in a `TUI_AGENT_CONFIG`-style capability file, never in branches.
- Transcript resolver keyed by hook-supplied `transcriptPath` with tail-only reads and size caps, feeding the session-detail Q&A pairs the migration note leaves status-only.
- Backfill from provider session stores for hook-uncovered history, fenced by launch-token hash like orca's spool replay.

Deliberate non-borrows: the daemon/relay topology, mobile pairing, and cloud relay stay out; JanusX keeps single-desktop scope. No vendor SDK becomes a runtime dependency; orca stays a read-only reference (the shallow clone lives outside the repo in temp).

## Verification

- `git clone --depth 1 --single-branch https://github.com/stablyai/orca.git` (28,685 files) into local temp; all paths above read in full, not inferred from names.
- Installed-build state at `%APPDATA%/orca` and `%USERPROFILE%/.orca/agent-hooks` matches the source mechanism field for field.
- No JanusX code changes in this note; no test or typecheck surface touched.

## Alternatives considered

- Borrow the code directly (vendor hooks/shims as a runtime dependency): strongest case is fastest parity, but it drags orca's daemon/relay topology assumptions and a third-party runtime into single-desktop scope; rejected in favor of pattern-only borrowing with JanusX-owned receiver and normalizers.
- Do nothing / stay on pty heuristics plus checkpoint snapshots: zero new surface, but per-turn agent prose and provider session identity stay unreachable; rejected because the revisit signal that motivated this note remains open.
- Adopt the full topology (daemon, relay twin, mobile pairing, cloud relay): complete feature parity with orca, but out of the stated single-desktop scope and expands the trust boundary (loopback tokens, endpoint files); deliberately not borrowed, recorded in Proposal.

## Acceptance criteria

- [ ] Every mechanism claim above resolves to a file path in the 2026-09-21 shallow clone or the installed `%APPDATA%/orca` state; no claim rests on names alone.
- [ ] The five borrow items in Proposal stay pattern-only (no orca source vendored, no vendor SDK at runtime).
- [ ] The transcript-content revisit consumes the hook/normalizer/transcript/backfill split as specified, or records why it diverged.

## Risks

- Orca paths drift with versions: the clone is pinned to 2026-09-21; later orca layouts may invalidate the cited paths, so re-verify before borrowing.
- Windows/POSIX parity: shims and newline bindings differ per platform (see `installer-utils.ts`, per-agent newline bindings); a JanusX port must cover both or explicitly scope down.
- Hook trust boundary: loopback receiver plus token auth plus fail-open timeouts must be re-established on JanusX terms; copying the shape without the token/fail-open discipline would widen the attack surface.
- Scope creep into daemon/relay/mobile: the deliberate non-borrows must stay out; any revisit needs its own note and threat review.
