---
{
  "schema": "harness-note/2",
  "id": "4814a657-5198-5e3f-9284-d0bfc600d43f",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-17",
  "parent": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/33cccd84-ffbf-4a67-aa3a-3380c842af04",
  "class": "feature",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-17-agent-note-claude-code-version-detection-and-install-in-settings--4814a657.md",
      "sourceHash": "5ce99aa6e3569a50cc097aa25bf3285caa30dbb4a48b4131472354ff3860d2cc",
      "originalBodyHash": "eabe25047c8e8103df3d415a85c8b2f1aba5d7cfd7ef41080d36ef70a4a63733",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Claude Code version detection and install in Settings. No age-based archival.",
      "edits": [
        "Rebased Markdown destination: ../../proposed/feature/2026-09-17-cc-switch-port.md -> ./2026-09-17-cc-switch-port--33cccd84.md",
        "Removed redundant Agent Note title prefix",
        "Removed lifecycle duplicated by frontmatter"
      ],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/feature/2026-09-17-cc-switch-cli-detect-install.md",
        "sourceHash": "403cde040f9bce6b13f1cfce9e3209e2c3526afee06f18207e4c89bd1bd5ace6",
        "originalBodyHash": "4d846ec9fda2514df062deb4efcf67adaea33a3031b985eda31f5bfcb176cfb9"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/bdd26e4e-8207-4c1f-8ea3-21f450ee7570"
}
---
# Claude Code version detection and install in Settings


## Problem

JanusX shells out to Claude Code but never inspects it: the only readiness signal is a boolean presence check (`checkCommandExists` in `src/main/terminal/presets.ts`), and installing or upgrading means leaving the app for a terminal. The existing external-write path (`src/main/notifications/agent-hook-config.ts`) is non-atomic and queue-free, so it cannot host a safe install flow. Without a version signal the settings surface cannot tell "not installed" from "installed but broken" from "upgrade available", and every provider switch stays a manual file edit.

## Decision

The settings general tab owns a Claude Code card backed by a new `src/main/cc-switch/` domain behind `CcSwitchService`. Detection probes the default `PATH` first so the display always equals the binary the user shell resolves, and falls back to known install directories (`%APPDATA%\npm`, `%LOCALAPPDATA%\Programs\claude`, `~/.local/bin`, `/usr/local/bin`, Homebrew on macOS) only on a miss; a binary that fails `--version` reports installed-but-broken with a diagnostic tail instead of being masked as missing. Windows probes and installs run through PowerShell with output encoding pinned to UTF-8 and the located absolute path single-quoted, and the detector never bare-invokes a tool name. Latest-version lookup stays off the card critical path on the npm `dist-tags` light endpoint under a 15-second timeout, and only a strictly-greater latest raises the upgrade badge via a semver comparator shared verbatim between main and renderer. The card paints from the local probe first and folds the latest version in when it arrives, so a slow registry never holds the first paint hostage. Install and upgrade share one `npm i -g @anthropic-ai/claude-code@latest` path executed silently (Windows PowerShell, POSIX direct spawn, five-minute timeout, child `PATH` augmented with the known npm directories), guarded by a synchronously-set busy flag because npm global writes must never overlap, and every install re-probes before reporting success so a zero exit code alone never claims victory. Wiring follows the house IPC chain (`src/shared/ipc/cc-switch.ts` to `src/main/ipc/cc-switch-handlers.ts` to a `ccSwitch` preload bridge to `src/renderer/src/services/cc-switch.ts`), and the card (`src/renderer/src/components/CcSwitchManager.tsx`) renders the four states with install, upgrade, and re-detect actions plus zh-CN/en copy. This serves [the cc-switch port proposal](./requirements/cc-switch-port.md), scoped to its phase 1.

## Alternatives considered

- Reuse `language-service/installer.ts` staged-binary flow for the install — strongest case is a proven download-verify-commit layout with progress events. The driver that rules it out is distribution shape: Claude Code ships via npm, so the correct primitive is an anchored package-manager command with `PATH` augmentation, not an artifact fetch; the installer stays a referenced template.
- Poll latest versions on a timer — strongest case is always-fresh badges. The driver that rules it out is cost without benefit: versions change rarely, probes spawn processes, and the card re-checks on every mount and on demand, which covers the freshness need with zero background load.
- Fold detection into `terminal/presets.ts checkCommandExists` — strongest case is one home for CLI readiness. The driver that rules it out is contract depth: presence booleans cannot carry versions, sources, or broken states, and terminal launch must stay a pure string splice with no probe latency on the spawn path.
- Do nothing / reuse manual terminal installs — staying put keeps every current path green. The cost is the gap above: no version signal, no in-app install, and provider changes remain hand edits outside the app.

## Consequences

- **Gains**: Settings shows Claude Code state (not installed, broken, ready, update available) with current and latest versions, and installs or upgrades in one click; 28 unit tests pin the probe priority, the broken-state distinction, the PowerShell UTF-8 invocation shape, the busy-guard race, and the semver boundary (`tests/unit/cc-switch/`). Follow-up: broken Codex self-heals through `uninstall || install` (removal best effort, reinstall always runs, re-probe decides); `listLocations` enumerates every install with the probe default marked first as the confirm-dialog data foundation; a 12-check tool matrix pins all five registry rows plus per-tool detect, broken-state, and npm-command coverage.
- **Costs and limits**: Install needs npm on a discoverable path, otherwise the card degrades to a copyable manual command by design; latest lookup needs registry access and degrades to unknown offline. The busy guard is process-local, so two JanusX instances could still race npm. Self-heal is Codex-only (no official self-update there); anchored upgrades with honest `anchored=false` copy and the multi-location confirm dialog UI remain open. Adding the next tool means a new registry row plus its detector and projector, not a framework change; provider credential switching stays out of scope until the profile-store phase lands.
