---
{
  "schema": "harness-note/2",
  "id": "85cfee57-254e-5739-b177-0d6e6ac82c86",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-17",
  "class": "process",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-17-agent-note-github-pages--85cfee57.md",
      "sourceHash": "98b67fd1b88c961bd646d125e19047723df7964e701e1f3a3a4580326e59bc99",
      "originalBodyHash": "f339391e1e0b0365af4e738fc24fd488eaa68a3dd7c162a39f4a666ae426279e",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents GitHub Pages 下载落地页. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix","Removed lifecycle duplicated by frontmatter"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/process/2026-09-17-landing-page.md",
        "sourceHash": "98b67fd1b88c961bd646d125e19047723df7964e701e1f3a3a4580326e59bc99",
        "originalBodyHash": "f339391e1e0b0365af4e738fc24fd488eaa68a3dd7c162a39f4a666ae426279e"
      }
    }
  },
  "updated": "2026-10-08T03:43:42.554Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/3a4dc304-70dd-49e4-b46a-ee2fc0fbc83e"
}
---
# GitHub Pages 下载落地页


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
- **Visual language**: the page renders in the application shell language — neutral gray ramp surfaces with weak white borders, kicker eyebrows for hierarchy, and ghost buttons throughout — so the amber accent appears only in text, 1px borders, and the version status dot. No emoji icons ship in the markup. The `OfficeSetupGate` dialog follows the same language with identical installer copy and confirmation flow.
- **Costs and limits**: `gh-pages` evolves outside `main` history, so copy updates need a deliberate checkout of that branch; `main` must never be pushed as a side effect of site work. The page advertises Windows only; macOS/Linux entries and a custom domain are the revisit signals.
