# Agent Note: Post-turn changed-file card across external CLIs

Status: proposed

## Problem

opencode ends every agent turn with a card listing the files that turn created or modified — PNG, Markdown, code — with per-file add/delete counts and an expandable diff. JanusX wants the same effect but drives external CLIs through a pty, so the mechanism cannot be copied: there is no in-process message stream to attach to, and no shared UI toolkit with the CLI.

Three findings block the work and are currently unrecorded:

1. **No turn-scoped change surface exists.** The right-dock `checkpoints` tool lists every checkpoint with a count and an on-demand diff drawer, but nothing is attached to a turn boundary and nothing computes a change set when a turn ends.
2. **The checkpoint layer cannot carry the feature safely.** `checkpointManager` stores a content hash plus a content blob with no size cap and no binary handling, and `getDiff` calls `Buffer.toString()` on snapshot content — a generated PNG yields a garbage diff and a large binary is read fully into memory. Turn-end would trigger this path every time.
3. **Per-engine rendering capability is unmeasured.** JanusX already installs code into four of five engines, through two mechanisms with different power. No record states which engines can render a card natively, so a plan risks promising one where none is possible.

## Proposal

Adopt opencode's data model — snapshot before the turn, diff after — because JanusX already owns an equivalent snapshot per turn. Reject its ownership model: JanusX has no session/message object, so attach the change set to the terminal turn instead.

### What opencode does

Verified against `sst/opencode`. The file list is **not** derived from tool calls; it is a git tree snapshot diff, which is why it also catches `write`, bash-side writes, and formatters.

- Shadow repo at `<Global.Path.data>/snapshot/<projectId>/<hash(worktree)>` (`packages/opencode/src/snapshot/index.ts`), sharing the source object database through `objects/info/alternates` and copying the source index so already-hashed blobs are reused.
- `track()` stages `git diff-files --name-only` plus `git ls-files --others --exclude-standard`, drops gitignored candidates, skips untracked files over 2 MiB, then `git write-tree` returns the tree hash.
- `patch(hash)` = `git diff --cached --no-ext-diff --name-only <hash> -- .` for the path list.
- `diffFull(from, to)` combines `--name-status --no-renames` for `added`/`deleted`/`modified`, `--numstat` for counts and binary detection (`-`/`-` means binary: zero counts, empty patch), and batched `git cat-file --batch` for before/after content.
- Turn boundary: `session/processor.ts:102` snapshots *before* the provider stream — the comment records the AI SDK may run tools before emitting `step-start`. `step-finish` snapshots again, calls `patch(初始)`, persists a `patch` part; `session/summary.ts` takes the first `step-start` as `from` and last `step-finish` as `to`, runs `diffFull`, writes `summary.diffs` on the user message.
- Delivery: `session.diff { sessionID, diff }`; TUI reducer stores `session_diff[sessionID]` (`packages/tui/src/context/sync.tsx:269`).
- Rendering: sidebar "Modified Files" (`packages/tui/src/feature-plugins/sidebar/files.tsx`), collapsible above two files with left-truncated paths and `+N`/`-N`; desktop inline card (`packages/app/src/pages/session/timeline/message-timeline.tsx:145`) with "N changed files", aggregate counts, Show-all above ten files, and one accordion item per file rendering its diff only when expanded.

### What JanusX already has

`checkpointManager.createCheckpoint()` runs once per submitted prompt line and stores `filesSnapshot: Record<path,{hash,size}>` plus a content blob store — the equivalent of `track()`. `getChangedFilePathsFromIndex()` is the equivalent of `patch()`. `getDiff`/`getAllDiffs` are the equivalent of `diffFull()`. `gitAdapter.listTrackedFiles()` uses `git ls-files --cached --others --exclude-standard`, the same candidate set as opencode, so newly generated untracked files are already captured. The checkpoint is created on `terminal:submit-line` (`src/main/ipc/terminal-handlers.ts:1003`), which is the turn-start baseline, and `onResolvedPayload` in the same file already fans out to `companionSessionState`, `agentTurnRecorder`, and telemetry refresh — the natural place for one more sink. Turn boundaries come from `AgentHookCoordinator` (`Stop`/`StopFailure`/`session.idle`/`session.error`/`SessionEnd` plus three synthetic signals), surfaced as `AgentHookCompletion`.

The missing work is a turn-end change computation and a render surface, not a new snapshot engine.

### Rendering capability per engine — verified

`AgentHookConfigManager` (`src/main/notifications/agent-hook-config.ts`) installs code into four engines through two mechanisms, and the mechanism caps what is possible:

| Engine | Install mechanism | In-process code | Native card | In-TUI external render channel |
|---|---|---|---|---|
| opencode | JanusX-owned config dir `<userData>/janusx/hooks/opencode` via `OPENCODE_CONFIG_DIR`; writes `opencode.json` + `plugins/janusx-notify.js` | Yes | Yes — 12 slots (`app`, `app_bottom`, `session_prompt_right`, `sidebar_content`, …), `api.ui.toast`, `api.route.register`, `api.event.on` | Yes, via plugin |
| pi | `<userData>/janusx/hooks/pi/janusx-notify.js` via `--extension` | Yes | Yes — `ctx.ui.setWidget(key, string[] \| factory, {placement})`, `ctx.ui.custom(factory,{overlay:true})`, and `registerEntryRenderer` + `appendEntry` which renders inline in the transcript without entering LLM context | Yes, via extension |
| janus | Own CLI, env-gated, no files | n/a | Yes, in the sibling repo | Yes |
| claude | `~/.claude/settings.json` hooks spawning a subprocess | **No** | **No** | **Yes, one line** — `statusLine: {type:"command", command}` renders the command's stdout in Claude Code's own status line. A competing workspace manager already uses this on this machine |
| codex | `~/.codex/hooks.json` spawning a subprocess | **No** | **No** | **No** — `status_line` in the codex binary is a boolean display toggle next to `status_line_use_colors`, not a command; `notify` runs a program at turn end but its output is not rendered |

The engines that already run JanusX-authored JavaScript in-process are exactly the ones that can host a native card; the ones that only run a subprocess cannot.

### The consistency invariant

The requirement is that the card reads identically whichever external CLI is in the pane. That requirement rules out native injection, and the reason is structural rather than a matter of API coverage:

- Each TUI renders with its own layout, palette, and component set, so the same card content produces a different card in each. Consistency would have to be re-established per engine and re-verified on every upstream release.
- Two of the five engines cannot host a card at all, so a native path can never cover the set — the best it can do is be native for three and absent or substituted for two.
- Any engine that gains a native card changes the product's visual contract for that terminal only, so the set drifts apart over time without a single decision causing it.

**Therefore: one overlay component, five engines, no per-engine native adapters.** The surface is a small island docked inside each terminal pane, and it is an overlay rather than a layout sidebar — it never enters the App grid, so it costs the terminal no width.

The same invariant also rules out the per-engine affordances that do exist. Claude's `statusLine` command can render a one-line indicator inside Claude Code's own status bar, and pi and opencode can render a full native card — but using any of them makes that terminal's card different from the others, which is exactly what the invariant forbids. They stay unused, and the capability table above records them so a future decision to relax the invariant starts from measured facts rather than a re-survey.

### The turn-change island

A per-pane island with three states, reusing the Janus island's morph machine rather than inventing a second one.

| State | Form | Trigger |
|---|---|---|
| `collapsed` | One pill at the pane's right edge, about 140×24, reading `3 files · +42 -17` | Default; also the resting state after the TTL expires |
| `expanded` | File list — path plus per-file `+N`/`-N` — clamped to the pane | Turn end on the focused pane; or a click on the pill |
| dismissed | Not rendered | Esc, click-away, or the next turn starting |

**Mount.** As a sibling of `<CLITerminal>` inside each tab's `absolute inset-0` wrapper in `TerminalArea.tsx` (around the existing failure-card overlay). That wrapper already carries `visibility`, `pointerEvents`, and `zIndex` per active tab, so the island follows the pane through splits and drags, hides on inactive tabs, and sits above the canvas — all inherited, none re-implemented.

**Morph.** One container with `data-stage`, animating `width`/`height`/`border-radius` on `cubic-bezier(0.16, 1, 0.3, 1)` and cross-fading the collapsed and expanded content, matching `.janus-island-shell` in `styles/02-janus-monitor-core.css`. `prefers-reduced-motion` collapses the durations.

**Adaptive sizing.** Every dimension is relative to the pane, never the window: `width: min(300px, 52%)`, `max-height` with internal scroll, and vertical placement clamped so the island never enters the band the CLI composer occupies. A pane too narrow to host the expanded form refuses to expand and stays a pill, so a three-way split degrades instead of breaking.

**Focus.** The island must not steal focus from the terminal, because `CLITerminal` focus is externally managed and losing it stops keyboard input. The chrome takes `onMouseDown` with `preventDefault` so xterm keeps focus; only the file rows and the expand control accept focus themselves.

**Multi-pane policy.** Only the pane whose turn just ended *and* which is focused auto-expands. Other panes show the collapsed pill only, so a four-way split never produces four cards at once.

**TTL.** Auto-collapse after a few seconds, paused on hover or focus, and cleared entirely once the user clicks to pin. Click-away or Esc unpins.

**Scope of the expanded form.** The island is an index, not a diff viewer: it lists paths and counts, and a row hands off to the existing viewers. Rendering diffs inside the island would make it tall enough to bury the terminal, which is the one thing this surface must not do.

The overlay is the transient signal and the bottom-drawer `changes` view is the persistent record — the same split as the existing product-notice matrix, where the capsule signals and the tray records.

## Follow-up

- **HTML prototype of the island.** A high-fidelity prototype of the three states, the morph timing, the narrow-pane degradation, and the multi-pane auto-expand policy, before implementation starts. Recorded here so the need is not lost; it is not part of this note's implementation scope and is scheduled separately.

## Alternatives considered

- **Inject ANSI bytes into the pty output stream** — strongest case is the card lands in the CLI's own scrollback and looks native everywhere. Ruled out on correctness: the TUIs repaint the full screen and maintain their own cursor and line model, so injected bytes are wiped by the next repaint or corrupt that model. The island reaches the same visual result with no coupling.
- **Write to pty stdin** — rejected outright: `terminal:input` reaches the CLI as keystrokes, so the card would be typed into the prompt line.
- **A per-terminal layout sidebar inside the pane tree** — strongest case is persistence and room for richer content. Ruled out on width: the center column is already `minmax(320px, 1fr)`, and a sidebar nested inside the pane multiplies against the app sidebar, the right dock, and the pane split — three independent taxes. At a 1600px window with a two-way horizontal split and a 240px sidebar each terminal falls to roughly 47 columns, and a three-way split to roughly 22. The island keeps the persistence and the room by overlaying instead of reflowing.
- **A right-dock `changes` tool** — strongest case is it reuses the existing rail and collapses to 48px. Ruled out as redundant: the dock already carries `files`, `git`, and `checkpoints`, and the product workspace already contends for the same right-side space. The bottom drawer holds the persistent record instead, where the runtime drawer already renders one card per terminal.
- **Instantiating the Janus island idiom per pane** — rejected as a dilution of the signature component. The island's force comes from being singular and central; five panes would produce five islands and turn the signature into noise. The turn-change island borrows the morph machine and the easing, not the identity.
- **Native adapters for every engine that can host one** — strongest case is fidelity inside opencode and pi. Ruled out by the consistency invariant: it makes the same card look different per terminal, triples the maintenance surface, and couples JanusX to two third-party APIs that can change without notice. Claude's `statusLine` indicator is ruled out the same way — a one-line affordance available on one engine of five is an inconsistency, not a partial win.
- **Derive the file list from tool calls** — strongest case is precision and no diffing cost. Ruled out because JanusX has no per-tool-call stream for external CLIs, and snapshot diffing also catches `write`, bash-side writes, and formatters. opencode made the same choice.
- **Adopt opencode's shadow git repo** — strongest case is incremental snapshots with the 2 MiB guard already solved. Ruled out for now because the checkpoint already provides a per-turn snapshot with a blob store and a restore path, and a second snapshot engine doubles storage and failure modes. Steal only the size guard, the binary handling, and the git-incremental listing.
- **Turn changes as the data source for product notices** — cleanest end state, one baseline and one panel. Deferred: it changes the product workspace notice contract, more than this feature justifies.

## Acceptance criteria

- [ ] A turn-end change set is produced for every engine reporting turn boundaries, including interrupted and failed turns, with `kind` distinguishing them.
- [ ] Binary and oversized files report `binary` and `size` without reading or diffing content, and the blob store enforces a cap.
- [ ] Per-file change records replace the concatenated `getAllDiffs` string, and diffs load lazily per file.
- [ ] One island renders inside the terminal pane for all five engines, without stealing keyboard focus and without covering the band the CLI composer occupies.
- [ ] The island is one component: identical markup, tokens, collapsed form, and behavior regardless of engine, with no engine-specific branch in the render path.
- [ ] The island follows its pane through splits, drags, and tab switches, and hides on inactive tabs.
- [ ] Sizing is relative to the pane, and a pane too narrow for the expanded form stays collapsed rather than breaking.
- [ ] Only a focused pane whose turn just ended auto-expands; other panes show the collapsed pill only.
- [ ] Changed-file counting no longer re-hashes the whole workspace on every query on a git repository.
- [ ] No new runtime dependency, and no CLI configuration outside the JanusX-owned directories is modified — including Claude's `statusLine`, which stays untouched.

## Risks

- **Checkpoint cost on large workspaces.** Full re-hashing per turn end is the likeliest regression; mitigate with git-incremental listing and keep the mtime fast path for non-git workspaces.
- **Blob store growth.** Content-addressed blobs accumulate with no eviction; a cap plus a retention window is required before shipping.
- **The island covers terminal text.** It is an overlay by design, so the expanded form hides whatever it sits on, and in a narrow pane that is a large fraction of the width. Accepted as the trade for zero width cost; mitigated by the short TTL, the collapsed default, click-away dismissal, and the island being an index rather than a diff viewer.
- **The island can cover a CLI's own chrome.** opencode renders its own sidebar, so the island may sit on top of it. Accepted: there is no per-engine branch in the render path, and offsetting per engine would break the invariant.
- **Focus leakage.** A clickable element inside the terminal pane can take focus from xterm and stop keyboard input. The chrome takes `preventDefault` on mouse-down, and this needs an explicit regression check.
- **Multi-pane noise.** Without the focused-pane gate, a four-way split produces four expanded islands at once. The gate is a policy, not a type, so it can regress silently — cover it in tests.
- **Checkpoint cost on large workspaces.** Full re-hashing per turn end is the likeliest regression; mitigate with git-incremental listing and keep the mtime fast path for non-git workspaces.
- **Blob store growth.** Content-addressed blobs accumulate with no eviction; a cap plus a retention window is required before shipping.
- **The island is not scrollback.** It is a viewport layer, so it is absent from the terminal's selectable text and its scroll history. That is intended — it is a transient signal with the drawer holding the record — but it means island content cannot be copied as terminal text.
- **Turn-to-checkpoint binding is approximate.** The checkpoint is created on `submit-line` while the turn starts on `UserPromptSubmit`; inputs bypassing `submit-line` leave a turn without a baseline. Fall back to the git HEAD baseline and record the fallback.
- **Two overlapping "what changed" surfaces.** Product notices and turn changes can both fire for one file, reading as duplicate notification until merged.
