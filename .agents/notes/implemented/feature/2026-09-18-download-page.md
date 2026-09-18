# Agent Note: JanusX download page

Status: implemented

## Problem

Visitors need to choose a Windows package and understand installation before exploring the application. Repeated download actions separated by feature cards obscure that task. A failed release request is also insufficient evidence that the first release is still being prepared.

## Decision

The public page uses a left-aligned introduction, a single two-column package section, installation steps, and support links. The reference is [Orca's download page](https://www.onorca.dev/download): shared alignment, restrained separators, clear package labels, and generous section spacing make its download choices easy to scan. JanusX retains its existing icon, neutral shell surfaces, system typography, and amber outline actions. Small screens stack the package options and steps.

The site remains static on gh-pages. Release lookup selects only explicitly named JanusX Windows x64 assets, checks their GitHub download origin, and shows actual package sizes and publication date. Missing packages link to release history. An HTTP 404 means no public stable release is found; network errors, timeouts, and rate limits display a separate unavailable state. Without JavaScript the release links remain usable.

## Alternatives considered

Reusing the existing feature-led page avoids layout maintenance, but leaves the primary download decision spread across two sections. Copying Orca's entire platform matrix offers consistent platform browsing, but advertises packages JanusX does not publicly provide. A framework-based site supports future routing but adds a build and dependency pipeline to a single static download page.

## Consequences

The page prioritizes package selection, followed by installation steps, core functionality and explicitly experimental capabilities. Six GIF recordings show terminal splitting, right-sidebar tools, the standalone Janus CLI, roundtable preparation, blueprint browsing and knowledge review. The recordings use an isolated profile and an actual source checkout; manually authored blueprint and knowledge content is identified in the copy. No model-generated result is represented by the preparation recordings.

Static PNG posters keep initial loading light and motion optional. Each play button loads its GIF on demand and returns to the poster when stopped. Failed GIF loading restores the poster and offers retry. No JavaScript leaves the poster and full-size GIF link available; reduced-motion preferences get the same static default. Compared with static-only images, GIF communicates drag and navigation behavior while remaining compatible with README images. Branch-local assets keep the site independent of application-branch asset URLs, at the cost of copying the six GIF/poster pairs from `wiki/assets` when the interface changes. All images have dimensions, descriptive alternative text and lazy loading.

CSS and release handling are separate files to keep layout and failure behavior inspectable. Package filenames must retain the builder's explicit x64 naming; additional architectures require explicit choices rather than silently changing the selected binary. GitHub API availability affects live metadata, while release-history links provide the fallback.

Run `node tests/download.test.cjs` with Playwright available through `JANUSX_PLAYWRIGHT` or the normal module lookup. The check covers release success, missing packages, wrong architectures, empty releases, request failures, invalid URLs, no JavaScript, and desktop/mobile layout bounds. Screenshots are written outside the site when `JANUSX_SCREENSHOTS` is set.
