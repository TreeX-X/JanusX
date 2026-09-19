# Agent Note: Pi and self-built Janus lifecycle

Status: implemented

## Problem

The terminal matrix covers third-party npm tools but not the two CLIs closest to home: Pi Agent never appears, and Janus — built from the sibling janus-agentX source and globally linked — has no update story at all. A registry that cannot express "built here, not downloaded" forces the self-owned tool into manual rebuilds while third-party tools enjoy one-click upgrades.

## Decision

The registry gains two rows with different strategies. Pi Agent is a standard npm row (`@earendil-works/pi-coding-agent`, dist-tags latest) reusing the shared probe, silent install, and badge flow untouched. Janus declares a `localLifecycle` instead of an npm package: the installer locates the sibling source through an injectable root resolver defaulting to `../janus-agentX`, verifies `packages/cli/package.json` carries `@janus-agent/cli`, reads its version as the latest signal, and updates by running `npm run build` then `npm link` in the package directory with the working directory pinned per step — any step failure stops the chain and surfaces its tail. Missing source (packaged app, moved checkout) degrades to the manual command instead of a fake install, and an unknown latest never blocks the card. The service routes latest by strategy and otherwise treats both tools like any other row; the run plumbing carries an optional working directory. Official `pi.svg` and `janus.svg` from the existing asset set back the new rows.

## Alternatives considered

- Publish Janus CLI to npm and treat it like the rest — strongest case is a uniform pipeline with no special cases. The driver that rules it out is release reality: the CLI ships with the sibling source today, and a registry release is a separate distribution decision; the local strategy models what exists.
- Rebuild unconditionally without verifying the package name — strongest case is fewer failure modes. The driver that rules it out is directory confusion: a stale or foreign checkout at the expected path must refuse loudly rather than link the wrong binary globally.
- Resolve the sibling root from the workspace file layout — strongest case is no Electron dependency. The driver that rules it out is packaged truth: only `app.getAppPath()` knows the dev root, guarded so tests and packaged runs degrade cleanly.
- Do nothing / update Janus by hand — staying put costs nothing now. The cost is the asymmetry above: every other row self-updates while the in-house tool needs a terminal ritual its own app could perform.

## Consequences

- **Gains**: Pi probes, installs, and upgrades like the rest; Janus shows source-version drift and rebuilds plus relinks in one click when the source is present. Five new tests pin the build-then-link sequence with pinned working directories, build-failure short-circuit, missing-source guidance, and both known and unknown local latest (`installer.test.ts`, `llm-sync.test.ts` — 37 tests green in the domain).
- **Costs and limits**: Local updates need the sibling checkout with installed dependencies beside the app; otherwise the row is detect-only with manual steps. The link step mutates the global npm prefix, so concurrent JanusX instances share the existing npm-level serialization only through the installer busy guard.
