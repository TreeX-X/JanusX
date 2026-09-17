# Agent Note: GitHub 维护标准

Status: implemented

## Problem

JanusX heads for a beta cycle and a v1.0 launch with no written GitHub discipline. Tags use a legacy uppercase `V` prefix the release workflow never matches, so twelve pushed tags produce zero Releases. Branch pushes, CI gates, and issue triage all run on unwritten convention, which strands the next agent without a source of truth.

## Decision

Tag, release, branch, CI, and issue flow follow one written standard. Tags use lowercase `v` in `vX.Y.Z`, identical to the `package.json` version; the legacy uppercase `V*` tags stay frozen in history. Pushing a `v*` tag drives `release-win` end to end: version guard, Windows build, and automatic public Release with installer assets plus `latest.yml`; every `v*` tag therefore publishes publicly, and a pre-release needs an explicit `gh release edit <tag> --prerelease` after the run. Draft releases never enter the updater or landing-page feed. The `main` branch requires a pull request, one approval, and a green `verify` check; administrators bypass only for CI-outage emergencies with a written note. The `verify` workflow mirrors the release build graph (sibling `janus-agentX` checkout plus sibling `dist` build, `prepackage`, full `verify`) on `windows-latest` for pull requests and `main` pushes. Both workflows build the sibling first because `@janus-agent/*` ships compiled `dist`, which a fresh checkout lacks. The sibling build retries up to three passes because its workspace order ignores `file:` topology; ordering ownership stays with that repository. Issues arrive through three templates (bug, feature, beta feedback) with blank issues disabled, triage through `beta-feedback` and `release` labels, and schedule through the `Beta 内测` and `v1.0 正式版` milestones. The genuine beta version format `v1.0.0-beta.N` stays reserved for an explicit maintainer declaration. Process detail lives in a single home:

- [CONTRIBUTING.md](../../../CONTRIBUTING.md) — branch, PR, tag, release, and issue rules for humans and agents.

## Alternatives considered

- Keep pushing `main` directly — strongest case is zero workflow friction for a solo maintainer, but every change then lands without a review trace or a guaranteed green gate, and agents inherit no enforceable handoff.
- Adopt GitFlow with `develop` and release branches — strongest case is textbook isolation, but a second long-lived branch doubles merge overhead for a one-maintainer desktop app shipping from tags.
- Manual Releases from the web UI — strongest case is full per-release control, but hand-built assets drift from CI builds and the updater feed depends on machine-made `latest.yml`.
- Do nothing / reuse — staying put costs nothing today, but the uppercase-tag mismatch keeps silently producing tags that never release, which is the observed failure.

## Consequences

- **Gains**: every version maps to exactly one tag and one CI-built Release; PRs carry review trace plus a green gate; beta feedback lands in triaged issues under visible milestones; a new agent reads `CONTRIBUTING.md` plus this Note and follows the same flow.
- **Costs and limits**: solo review is self-review in practice, so the approval counts as a deliberate second look rather than independent scrutiny; the full `verify` gate (including the desktop smoke) runs minutes per PR on a Windows runner; pre-release marking stays a manual step until the workflow learns the prerelease signal. The `Beta 内测` milestone closes at launch, and the beta description clause in the repo About needs trimming after v1.0.
