---
{
  "schema": "harness-note/2",
  "id": "434babf4-fac2-5482-aeb8-3a091332ee09",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-17",
  "parent": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/33cccd84-ffbf-4a67-aa3a-3380c842af04",
  "class": "feature",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-17-agent-note-multi-terminal-detection-with-icon-rows--434babf4.md",
      "sourceHash": "9ec2df1f6f655a05dce7676fe26a67b2700fc7378cbc9f96f751b0d5df534194",
      "originalBodyHash": "d27074f8b579e5bab77360b54b392bdc59f7348b5bfbb4235c48bf650d3a27f9",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Multi-terminal detection with icon rows. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix","Removed lifecycle duplicated by frontmatter"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/feature/2026-09-17-cc-switch-multi-terminal.md",
        "sourceHash": "9ec2df1f6f655a05dce7676fe26a67b2700fc7378cbc9f96f751b0d5df534194",
        "originalBodyHash": "d27074f8b579e5bab77360b54b392bdc59f7348b5bfbb4235c48bf650d3a27f9"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/bdd26e4e-8207-4c1f-8ea3-21f450ee7570"
}
---
# Multi-terminal detection with icon rows


## Problem

The external-terminal surface probes exactly one tool while the workspace shells out to several: terminal presets already offer Claude Code, Codex, and OpenCode, but Settings stays blind to everything except Claude. Each new tool risks a copy-paste detector with its own mappings; meanwhile four stacked cards waste vertical space and carry no visual identity. The detector, installer, and registry must grow by declaration, not by duplication.

## Decision

The registry declares three tools (Claude Code, Codex, OpenCode — the external CLIs the workspace presets actually launch) with npm package, binary names, manual command, and native-installer leftover directories in one row each, and the shared contract carries display metadata (monogram plus brand color) so main and renderer never fork a mapping. `ClaudeDetector` becomes descriptor-driven `CliDetector`, constructed per tool id, with Windows executable variants expanded from the base name and per-tool extra directories resolved through case-insensitive `%VAR%` expansion; the installer follows the same descriptor for its npm target. The service keeps one installer and one sync chain but fans detection out through a lazily built per-tool detector map, and the IPC allowlist validates against the registry instead of a literal. Settings renders one compact row per tool in registry order inside a single card — Janus first as the in-house tool, then the externals — using the official brand SVGs from `src/renderer/src/assets/icons/` (the same assets the terminal sidebar uses) with the monogram badge as load fallback. The card fills the settings control column like its neighbors (the column is a non-stretching flex row, so the card carries its own full width). Rows paint from the local probe behind a spinner, fold the latest version in when it arrives, and manual re-detect holds its own spinner state so fast no-change probes still read as acknowledged. Credential sync stays Claude-only by explicit guard; detection, latest, and install are the generalized surface.

## Alternatives considered

- Copy the Claude files per tool — strongest case is zero abstraction risk and per-tool quirks stay local. The driver that rules it out is per-tool drift: probe priority, PowerShell encoding, busy-guard, and semver fixes would need a landing per tool, and the GBK fix already proved single-point fixes matter.
- Third-party brand SVGs per tool — strongest case is real product icons with zero drawing work. The driver that rules it out is provenance: the repo already vendors the terminal icon set the sidebar uses, so rows reuse those assets with the monogram badge as load fallback instead of pulling new vendor marks.
- Generalize credential sync to all tools now — strongest case is symmetry. The driver that rules it out is per-app live-file divergence: each CLI owns a different config dialect and path, and each deserves its own applier plus acceptance pass rather than a shared guess.
- Do nothing / Claude-only cards — staying put keeps every current path green. The cost is the gap above: the presets launch tools Settings cannot see, and users install or upgrade blind.

## Consequences

- **Gains**: Three terminal rows with official icon, version, latest, and install or upgrade actions in one card; new-tool cost is one registry row plus one meta row plus one icon asset. Six new tests pin registry-driven probing, per-tool manual hints, registry consistency, and the sync-stays-Claude guard (32 tests green in the domain).
- **Costs and limits**: Credential sync and sync state remain Claude-scoped; the matrix panel names only Claude until per-app appliers land. Latest-version strategies are npm-only, so a future non-npm tool needs a strategy field plus a fetcher. Gemini is deliberately out of scope: only the external CLIs the workspace presets launch are managed.
