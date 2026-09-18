# Agent Note: Product screenshots and onboarding

Status: implemented

## Problem

Visitors need to see the desktop workflow before downloading JanusX. A command-only README does not explain package selection or the local sibling packages needed for source development.

## Decision

The README and download page show three real screenshots: workspace terminal, embedded Markdown editor, and project run configuration. The capture script uses a separate temporary profile and a generated Hello Janus project, with no model credentials or external AI calls. Images live in `wiki/assets` on the application branch and `assets` on gh-pages, so both surfaces render without depending on the other branch's deployment. The download choices remain above the product tour.

## Alternatives considered

Reusing text alone avoids asset maintenance but does not show the interface. GIF recordings communicate motion but add transfer cost and require motion controls on the site; static screenshots fit the three discrete interface examples. Hosting images only on Pages avoids duplication but ties README rendering to site publication.

## Consequences

Screenshots require refreshing after visible interface changes. Run `npm run build` followed by `node scripts/capture-product.mjs` on Windows with Node.js 24 and the installed Playwright dependency to regenerate three 1440 × 900 PNG files. Copy the images to the gh-pages assets directory together with related copy changes. The temporary fixture remains available for inspection; the capture closes its Electron application. The capture uses a PowerShell prompt for legible, non-personal terminal output.

The README distinguishes packaged installation from source development and documents the sibling janus-agentX dependency. The site retains its existing release resolution and fallback links. Run the gh-pages `tests/download.test.cjs` with `JANUSX_PLAYWRIGHT` pointing to this repository's Playwright installation to verify release states and five viewport widths.
