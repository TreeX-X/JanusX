---
{
  "schema": "harness-note/2",
  "id": "a162efb4-23a7-4468-95e6-7163fe7efdc0",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-10-01",
  "class": "feature",
  "updated": "2026-10-18T09:05:52Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/3a4dc304-70dd-49e4-b46a-ee2fc0fbc83e"
}
---
# README pixel header and introduction

## Problem

The capsule-only revision removed the standalone JanusX heading and made the opening less clear than the public README. The user requested the earlier opening layout and a wordmark built from pixel blocks, while retaining the original rounded Janus capsule.

## Decision

README restores the public opening order: linked header image, JanusX H1, product positioning, a short description, release badges, navigation and the test-release notice. The existing new UI overview and feature sections remain in place. Four release/platform badges share one row; the earlier technology/provider badge row is omitted. The original resources/icon.png application logo is restored beside the header at 148px, matching the earlier README placement.

wiki/assets/readme/janus-header.svg is a transparent 640×180 illustration. Janus retains its original smooth paper-and-ink capsule, 156×78 body with a 39-unit corner radius, 24×30 rectangular eyes and nine-unit eye gap. The happy state briefly presents each anchored rectangular eye as six narrow LED strips. A rapid compression pulse travels across all twelve strips from left to right in about 580ms, then repeats once after a short gap. Adjacent strips are delayed 37.8ms; each compresses to half height and returns within 162ms. The strips start edge-to-edge, exactly matching the solid rectangular eyes. Their gaps open smoothly over 180ms before the first pulse; after both pulses finish, they close over 270ms. The complete reaction lasts 1.8 seconds. The normal and LED layers swap only at matching solid geometry, avoiding a visible cut or opacity dip. The nine-second Star timeline remains unchanged. This replaces slow organic edge deformation with a sharper electronic signal; the eyes and shell do not shift position. Only the wordmark uses pixel blocks; JANUSX reuses the exact PIXEL_WORDMARK patterns from src/renderer/src/components/janus/JanusChat.tsx, including the two-tone X. This changes the README illustration only, not the application or installer icon.

A nine-second animation restores the smooth rounded Star button, outlined five-point star and moving mouse pointer. The pointer arrives, the button scales to 0.985 on press, the star illuminates, and two quick electronic pulses sweep left to right through the LED eye strips. The pointer retreats continuously; the invitation briefly changes to “谢谢支持。” The shell and wordmark stay still. No account confirmation or Star count appears. The enclosing repository link takes readers to GitHub, where starring remains a separate user action.

Dark reading environments adapt the wordmark, button and supporting text. Reduced motion leaves ordinary eyes and the static invitation, hiding the pointer and acknowledgement. SVG uses no scripts, external fonts or network dependencies.

## Alternatives considered

Pixelating the mascot was rejected by the user; the rounded capsule preserves the accepted Janus identity. The application logo is restored at the user’s request alongside the capsule illustration. The technology badge row remains omitted; the selected layout retains the earlier title and introduction hierarchy.

## Consequences

The title remains searchable and readable independently of the image. The pixel illustration shares the application’s letter patterns while keeping the original rounded capsule silhouette. Small supporting text becomes less legible when the image shrinks on mobile, so product positioning and navigation remain ordinary Markdown below it.

## Verification

Playwright rendered the actual Markdown opening in a local preview at 1040px in light and dark modes and at 375px in light mode. All images decoded, JanusX rendered as H1, and each viewport had no horizontal overflow. SVG XML parsed without errors. Reduced motion reported zero active animations; during the reaction the LED layer is visible and ordinary eyes are hidden. The light preview was visually inspected. These are local browser checks; GitHub publication was not performed.

Preview: design/Janus-README-Pixel-Preview.html. Screenshots: artifacts/readme-pixel-light.png, artifacts/readme-pixel-dark.png and artifacts/readme-pixel-mobile.png. Older capsule/Star previews are comparison artifacts and do not represent the current README.
