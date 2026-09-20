# Agent Note: OfficeCLI bundled

Status: implemented

## Problem

Office preview depends on a version-pinned OfficeCLI, yet the app ships without it. The runtime probes PATH, a known location, and a user-data managed copy, then asks the user to download, confirm, repair, or remove that copy through a setup dialog and a settings section. Every new file type in the product workspace reuses this gate, so Office kinds carry install friction that markdown and html kinds never have. Pre-release is the last point where the download flow, its manifest, and its four installer channels can disappear without a migration.

## Decision

OfficeCLI is a bundled asset at `resources/officecli/officecli.exe` (pinned `1.0.135`, per-arch binary placed before packaging). `office-bundled-path.ts` owns the version, the expected SHA256, and the single resolver (`JANUSX_OFFICECLI_BINARY` override for dev, otherwise `<resources>/officecli`). `officecli-manager.ts` verifies only that candidate with `--version` plus `watch/create/batch` capability probes and reports `source: 'bundled'`. The broker pins the same SHA256. Preview, terminal, agent, and launcher consumers read the verified bundled path. Missing or incompatible binaries surface reinstall copy ("reinstall JanusX"), never an install prompt.

## Alternatives considered

- Keep the managed download flow (user-data `current.json` manifest, GitHub fetch, `installerStatus/Start/Cancel/Remove` channels, `OfficeSetupGate` plus settings `OfficeCliManager`). The strongest case is a slim installer and on-demand arch selection. The driver against it is permanent user friction plus a parallel update channel: every OfficeCLI release needs installer, manifest, hash, and dialog maintenance, and every preview failure needs install-versus-runtime triage.
- Keep PATH and known-location probing alongside the bundle as fallbacks. The strongest case is developer convenience and power-user overrides. The driver against it is hijack surface and nondeterminism: a stale PATH binary silently wins over the pinned bundle and breaks the version guarantee the broker enforces. The dev override survives as the explicit `JANUSX_OFFICECLI_BINARY` variable only.
- Do nothing and reuse the manual-install guidance (`manualInstallSuffix`, release URL, copy-item steps). The cost is the status quo: new users meet `NOT_INSTALLED` on first Office preview and must leave the app to fix it, while the product workspace promises generation-to-preview in one click.

## Consequences

The installer, its policy, and its managed root disappear, with the setup gate, the settings section, the workspace auto-popup, the engine button, and the manual-install copy. `shared/office.ts` keeps six invoke channels and two events; installer types, guidance types, and request validators leave with them. Packaging gains an `extraResources` step and a `resources/officecli/README.md` placement contract, and the installer grows by one Windows binary per arch. Without the binary in `resources/officecli`, previews fail closed with reinstall copy, which the missing-binary smoke covers only when the file is present. A future revisit signal is a second supported platform or an OfficeCLI release cadence that outpaces JanusX releases, at which point the bundle needs per-arch staging or a versioned sidecar.
