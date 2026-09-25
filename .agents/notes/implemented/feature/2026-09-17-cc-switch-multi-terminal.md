---
schema: harness-note/1
id: 434babf4-fac2-5482-aeb8-3a091332ee09
kind: decision
lifecycle: implemented
created: 2026-09-17
class: feature
---
# Agent Note: Multi-terminal detection with icon rows

Status: implemented

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
