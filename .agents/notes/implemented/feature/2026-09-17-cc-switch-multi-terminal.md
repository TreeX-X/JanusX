# Agent Note: Multi-terminal detection with icon cards

Status: implemented

## Problem

The external-terminal surface probes exactly one tool while the workspace shells out to several: terminal presets already offer Claude Code, Codex, OpenCode, and more, but Settings stays blind to everything except Claude. Each new tool risks a copy-paste detector with its own mappings, and the cards carry no visual identity, so four text-only rows blur together. The detector, installer, and registry must grow by declaration, not by duplication.

## Decision

The registry declares four tools (Claude Code, Codex, Gemini CLI, OpenCode) with npm package, binary names, manual command, and native-installer leftover directories in one row each, and the shared contract carries display metadata (monogram plus brand color) so main and renderer never fork a mapping. `ClaudeDetector` becomes descriptor-driven `CliDetector`, constructed per tool id, with Windows executable variants expanded from the base name and per-tool extra directories resolved through case-insensitive `%VAR%` expansion; the installer follows the same descriptor for its npm target. The service keeps one installer and one sync chain but fans detection out through a lazily built per-tool detector map, and the IPC allowlist validates against the registry instead of a literal. Settings renders one card per tool in registry order, each headed by a color-keyed monogram badge drawn purely in CSS with no binary icon assets. Credential sync stays Claude-only by explicit guard; detection, latest, and install are the generalized surface.

## Alternatives considered

- Copy the Claude files per tool — strongest case is zero abstraction risk and per-tool quirks stay local. The driver that rules it out is fourfold drift: probe priority, PowerShell encoding, busy-guard, and semver fixes would need four landings, and the GBK fix already proved single-point fixes matter.
- Brand SVG assets per tool — strongest case is real product icons. The driver that rules it out is licensing and weight: vendor marks carry usage constraints and binary churn, while a monogram plus brand color reads clearly at 28 pixels with nothing to ship.
- Generalize credential sync to all four tools now — strongest case is symmetry. The driver that rules it out is per-app live-file divergence: each CLI owns a different config dialect and path, and each deserves its own applier plus acceptance pass rather than a shared guess.
- Do nothing / Claude-only cards — staying put keeps every current path green. The cost is the gap above: the presets launch tools Settings cannot see, and users install or upgrade blind.

## Consequences

- **Gains**: Four terminal cards with icon, version, latest, and install or upgrade actions; new-tool cost is one registry row plus one meta row. Four new tests pin registry-driven probing, per-tool manual hints, and the sync-stays-Claude guard (30 tests green in the domain).
- **Costs and limits**: Credential sync and sync state remain Claude-scoped; the matrix panel names only Claude until per-app appliers land. Latest-version strategies are npm-only, so a future non-npm tool needs a strategy field plus a fetcher. Monogram colors are approximations, not vendor marks.
