# Agent Note: Win app auto-update via GitHub Releases

Status: implemented

## Problem

Every JanusX release scatters installed versions because no in-app update path exists. The scope boundary in `../../proposed/process/2026-07-14-cli-manager-scope.md` names automatic updates as the sole adoption from the adjacent suite, and its acceptance criterion stays open until a packaged build updates itself.

## Decision

The Windows nsis installer build checks the owning repository's GitHub Releases feed and installs newer versions in-app. `electron-builder.yml` declares a `github` publish target (`TreeX-X/JanusX`, `latest` channel), so each tagged release uploads the installer plus the generated `latest.yml`; no separate update server exists. `src/main/updater/service.ts` owns the update state machine over `electron-updater` with background download and install-on-restart, and it loads the updater library only on a supported runtime. `src/main/updater/guards.ts` restricts automatic updates to the packaged Win32 nsis build; dev mode, portable builds, and non-Windows platforms report an explicit unsupported reason and never attempt a silent install. Renderer visibility lives in the general settings page through `src/renderer/src/components/UpdaterSettings.tsx` over the `updater:` IPC contract in `src/shared/ipc/updater.ts`, showing check, progress, restart-to-install, and the downgrade hint. `.github/workflows/release-win.yml` publishes the Win build on version tags with the repository-provided token. Unsigned builds still update; the missing signature only surfaces as a first-install SmartScreen prompt, never as an update failure.

An `autoCheck` preference (`updaterSettings` in the global config, default true) governs the background schedule only. Turning it off stops the launch-delayed first check and the 6h poll without touching manual check or restart-to-install; turning it back on reschedules immediately when the service is armed. The persisted value applies at startup before the first schedule, and the settings IPC applies it to the running scheduler only after a successful disk write.

## Alternatives considered

- Self-hosted generic feed (`generic` provider on internal HTTPS): strongest case serves private deployments without touching github.com. The driver that defers it is operational cost before any customer demands it; the publish shape (yml plus artifacts) stays identical, so the switch costs a config change, not a rewrite.
- Lightweight checker that prompts a manual download: strongest case covers portable builds and dev mode today with zero signing or CI work. The driver that rejects it as the primary path is fragmentation: skipped installs keep old versions in the field, which fails the scope acceptance. It survives only as the downgrade hint for unsupported runtimes.
- Do nothing / reuse manual download releases: staying put keeps zero updater machinery. The cost is permanent version fragmentation plus a relitigated scope boundary every release.

## Consequences

- Win nsis gains background check (30s after launch, every 6h), manual check, and restart-to-install; every other runtime gains an honest unsupported message instead of a broken button.
- macOS signing plus notarization and the Linux AppImage/deb matrix stay open work under the owning scope note; the guards give those stages explicit extension points.
- Release discipline tightens: only `v*` tags publish, and the feed check script must verify yml-to-artifact alignment before wider rollout.
