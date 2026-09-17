# Agent Note: GitHub Pages 下载落地页

Status: implemented

## Problem

JanusX ships Windows installers through GitHub Releases, but the repository offers no shareable product page. A direct link to a release asset breaks on every version bump, and hosting binaries on Pages wastes quota. The cost of inaction is a missing public download entry for outreach and user onboarding.

## Decision

The public site lives on the orphan `gh-pages` branch as three files: `index.html`, `.nojekyll`, `icon.png`. The page is dependency-free static HTML with inline CSS. Download buttons never host binaries; they point at `releases/latest` and a script resolves the current `-setup.exe` / `-portable.exe` asset URLs through the Releases API. Without any published release the page degrades to a "首个正式版筹备中" state instead of dead links. Pages serves `https://treex-x.github.io/JanusX/` from `gh-pages` root.

## Alternatives considered

- Serve from `main` `/docs` — strongest case is single-history maintenance, but `docs/` is gitignored local-only scratch (`.gitignore` "Design & Documentation"), so Pages-from-docs fights repo convention and forces ignore-rule surgery.
- Separate website repository — strongest case is full isolation, but a second repo doubles maintenance for a one-page static site with no build step.
- README plus Releases links only — strongest case is zero new surface, but it provides no product narrative, screenshots-ready layout, or stable shareable URL.
- Do nothing / reuse — staying put avoids all maintenance, but leaves distribution without a public entry point, which is the stated requirement.

## Consequences

- **Gains**: a live shareable URL (`https://treex-x.github.io/JanusX/`, verified HTTP 200 with title markers and byte-exact icon) whose download buttons track new releases without page edits.
- **Costs and limits**: `gh-pages` evolves outside `main` history, so copy updates need a deliberate checkout of that branch; `main` must never be pushed as a side effect of site work. The page advertises Windows only; macOS/Linux entries and a custom domain are the revisit signals.
