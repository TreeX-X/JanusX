---
{
  "schema": "harness-note/2",
  "id": "e29da5b4-dc65-40a9-883d-9026e3b280b1",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-22",
  "class": "feature",
  "relations": [
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/36a4c7d5-fc0f-4436-9fc0-f925ef8fc4f7"}
  ],
  "extensions": {
    "r5Migration": {
      "sourceHash": "dd40b9880d9642ce4cdecb7d627334f58f025c64e38a7adbcbf6a3a76e7713bd",
      "repairs": ["relations[0].reason"],
      "originalRelations": [
        {
          "type": "related-to",
          "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/36a4c7d5-fc0f-4436-9fc0-f925ef8fc4f7",
          "reason": "The content slice defines turn prompt and excerpt fields; this slice supplies excerpts for every engine with a readable transcript store"
        }
      ]
    },
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-22-agent-note-per-engine-hook-capabilities-plus-transcript-resolvers--e29da5b4.md",
      "sourceHash": "261a763454bb4a6bd3b611d9a6a6d5aa16da099b20e30bc24afbbe344617cf26",
      "originalBodyHash": "471ce0335d6ba5287fb201f0754dc3556a0269176a44032e5d9752de650dac02",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Per-engine hook capabilities plus transcript resolvers. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/feature/2026-09-22-session-engine-capabilities.md",
        "sourceHash": "261a763454bb4a6bd3b611d9a6a6d5aa16da099b20e30bc24afbbe344617cf26",
        "originalBodyHash": "471ce0335d6ba5287fb201f0754dc3556a0269176a44032e5d9752de650dac02"
      }
    }
  },
  "updated": "2026-10-14T15:29:12.880Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/0cb931e1-e33c-4e38-a9d9-9d652796d935"
}
---

# Per-engine hook capabilities plus transcript resolvers

## Problem

Turn classification in `agent-hook-coordinator.ts` and `agent-turn-recorder.ts` repeats per-engine branches (`source === 'opencode'` in every predicate, duplicated event sets and status helpers), so each engine addition touches N sites and drift already exists between the two copies. Answer excerpts resolve only for claude while codex, janus, opencode, and pi turns stay status-only, even though codex rollouts and janus histories sit on disk in parseable shapes.

## Decision

`src/main/notifications/agent-engine-capabilities.ts` holds one table keyed by hook source: start, complete, fail, approval/attention rules, turn-end excerpt source, sentinel flag, and external session-store kind. The coordinator, recorder, terminal approval check, and sentinel gate consume it. Table membership alone does not prove that a CLI emits these events: DSH has a row but its hook installer is a no-op and has no live hook contract.

Turn-end excerpts dispatch through `src/main/sessions/transcript-excerpt.ts`: Claude reads the hook transcript tail; Codex prefers the recorded exact path, then finds rollouts in configured CODEX_HOME by thread/provider ID, retaining cwd fallback only without identity. Janus reads its history document by provider ID. Excerpts cap at 500 characters; Claude tails cap at 64KB and Janus documents at 2MB. Codex reads complete records through the bounded-prose streaming snapshot described in [external session sync](external-session-backfill.md), so trailing tools do not displace its answer. Opencode, Pi, and DSH have no turn-end excerpt resolver. Opencode has a sqlite list/detail driver and discovery respects XDG_DATA_HOME; Pi JSONL supports external discovery and detail reads. Current prose windows and recovery validation belong to [Transcript detail reads plus provider resume runs](session-resume-detail.md).

### Current terminal capability matrix

The supported presets in `src/shared/terminalLaunch.ts` are Shell, Claude, Codex, Opencode, Janus, Pi, and DSH. The following is source-backed coverage, not a claim that each installed provider passed real-session restoration. Agent registration assumes the matching preset; launching an agent manually inside a Shell terminal keeps the engine classified as Shell.

| Preset | Internal session ledger and normal turn signals | Conversation reads and external discovery | Native history recovery currently exposed | Explicit Continue in New Session |
| --- | --- | --- | --- | --- |
| Shell | No agent ledger or agent turn contract | No agent transcript reader or discovery | None; cold layout restore only recreates Shell terminals | No agent session row |
| Claude | Ledger plus installed hooks in the selected config home | JSONL detail and external scan | Internal/external/archived Resume through `claude --resume <id>` with preflight | Same-engine native resume with ID; focused handoff without ID |
| Codex | Ledger plus installed hooks in the selected CODEX_HOME | Rollout detail and external scan; exact restored-path excerpt | Internal/external/archived Resume through `codex resume <id>` with preflight | Same-engine native resume with ID; focused handoff without ID |
| Opencode | Ledger plus plugin events; turn-end excerpt absent | Sqlite list/detail and external scan in active data store | Internal/external/archived Resume through `opencode --session <id>`; requires present sqlite identity | Same-engine native resume with ID; focused handoff without ID |
| Janus CLI | Ledger plus native hook events on a compatible CLI | Local history document by provider id; no external scan | No Janus argv mapping in the session API, although the CLI supports `--conversation <id>` | Fresh CLI plus handoff; installed CLI's fresh-start behavior can remove old history |
| Pi | Ledger plus injected extension events; extension supplies no provider id or transcript path | JSONL detail and external scan; live-row history binding is incomplete | External Resume through a recorded session file | Fresh session plus handoff; internal native resume absent |
| DSH / DeepSeek | Launch ledger and submitted prompts; no reliable normal turn-end hook | No session-panel transcript reader or external scan | No mapped resume command | Fresh CLI plus handoff; delivery and complete turn capture are unverified |

`SessionPanel.tsx` offers separate Resume in cards and detail windows for internal, external, and archived Claude/Codex/Opencode records. Missing ID disables it; cwd/history availability is checked on invocation. Archive removes JanusX checkpoints rather than provider history, so native Resume remains possible where the original cwd and history still exist. Archived cards do not offer handoff Continue. Other engines retain their earlier UI: external non-archived Pi can Resume a recorded file, internal Pi cannot. Every remaining handoff retains the limitation that a PTY write does not prove provider acceptance.

Pi's generated extension in `agent-hook-config.ts` hardcodes `sessionId: undefined` and supplies no transcript path. The external scanner can discover the same provider file, but the registry cannot prove it belongs to the live row without a shared id or path; it deliberately does not merge by directory or time proximity. Default store discovery also ignores Pi's custom session-directory environment variables and launch options. Janus uses the CLI's local history reader but has no external discovery pass. DSH telemetry's explicit-id history lookup is separate from the session panel's scanner/reader and does not supply automatic ledger binding; its boundary belongs to [DSH terminal integration](../../terminal/dsh-terminal-integration.md).

### Janus CLI history preservation gap

Both `../janus-agentX/packages/cli/src/tui/run.tsx` and the installed `@janus-agent/cli/janus.js` call `startFreshConversation()` when no explicit conversation id is supplied. `ConversationRegistry.freshStart()` removes every previously loaded conversation from memory and the store; `fileConversationStore.remove()` unlinks its history file. JanusX currently launches its handoff continuation as `janus tui` without `--conversation`, so native history preservation is not guaranteed and old history can be deleted. This is verified by reading source and installed bundle, not by starting a real user session. No historical files were modified during analysis.

The CLI already accepts `janus tui --conversation <id>` and its registry selects the persisted conversation when present. If the requested id is absent, that registry creates a new conversation with the requested id; adding argv alone would therefore still need a presence check before claiming history recovery. Fixing this CLI preservation behavior is a separate cross-repository follow-up; no CLI source was changed here.

Cold application restore is independent of these provider paths. `src/renderer/src/lib/shell-restore.ts` records terminal layout but recreates every saved entry with `preset: 'shell'`, consumes the manifest, and never automatically resumes an agent. A restored terminal window is not evidence of restored dialogue.

## Alternatives considered

- Per-engine resolver modules with separate call sites — strongest case is isolated evolution per format. The driver that rules it out is dispatch duplication: one table row per engine already selects the parser, and the turn-end path stays a single call.
- Exact thread matching only for codex, no cwd fallback — strongest case is zero misattribution risk. The driver that rules it out is coverage: hook raws carry thread keys best-effort, and the freshest cwd-matching rollout is the same fallback orca uses where identity is absent.
- Initially deferring Opencode sqlite reads avoided a native driver dependency and unpinned schema. The current implementation uses the read-only `node:sqlite` driver described in [Opencode session driver](opencode-session-driver.md); turn-end excerpts still remain separate from list/detail reads.
- Shell sessions in the ledger — strongest case is literally every terminal covered. The driver that rules it out is meaning: shells have no turn boundaries, so there is nothing to record.
- Do nothing / keep claude-only excerpts with branched predicates — no churn. The cost is permanent status-only timelines for four engines plus the next engine copy-pasting the branches again.

## Consequences

- **Gains**: event classification is shared; Codex and Janus have turn-end answer prose; Opencode and Pi have separate persisted-history readers. The matrix prevents launch support or a capability-table row from being presented as complete recovery support.
- **Current gaps**: Pi lacks live provider identity, Janus has no session-API resume mapping and a CLI history-removal path, and DSH lacks event/history contracts. These and cold automatic agent recovery remain deferred. Claude/Codex/Opencode Continue and Resume are now aligned; actual defects, preflight, environment handling and verification are recorded in [the recovery Note](session-resume-detail.md).
- **Analysis evidence (2026-10-11)**: source reads covered presets, terminal registration, hooks, scanner, reader, API and UI. The initial six suites passed 77/77 before recovery changes; final repair evidence belongs to the recovery Note. Installed Pi, Claude, Codex and Opencode help confirms their session selectors; Janus source confirms `--conversation`. DSH's exact profile recovery contract remains unverified. No real-provider recovery or model turn was run.
- **Costs and limits**: Codex cwd fallback can misattribute when neither hook nor registry has identity; resumed rows use exact paths instead. Janus histories above 2MB skip; provider schema changes require re-verification. Native recovery validates availability and provenance but depends on the CLI, credentials and service. Earlier clean typecheck/hook results describe the original capability implementation; current whole-repository typecheck is blocked by an unrelated note-mcp-server expectedHash mismatch, as recorded in the recovery Note.
