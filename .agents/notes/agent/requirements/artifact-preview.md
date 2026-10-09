---
{
  "schema": "harness-note/2",
  "id": "e74d8e85-e690-44f8-8b0b-d229b7113401",
  "kind": "requirement",
  "lifecycle": "draft",
  "created": "2026-09-09",
  "class": "feature",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-09-agent-note-agent-html-artifacts-auto-preview--e74d8e85.md",
      "sourceHash": "f27670d085122f108998847324a4c6437fbae8735e2fae565ae0260dae4590b1",
      "originalBodyHash": "d4c7ca17d3114f18de9587893189ef309ababc9965c21038cbf31bca1051288f",
      "category": "formal",
      "reason": "Retains the source requirement in draft lifecycle; body documents Agent HTML artifacts auto-preview. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/proposed/feature/2026-09-09-artifact-preview.md",
        "sourceHash": "f27670d085122f108998847324a4c6437fbae8735e2fae565ae0260dae4590b1",
        "originalBodyHash": "d4c7ca17d3114f18de9587893189ef309ababc9965c21038cbf31bca1051288f"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/95ec5f71-33e3-4f71-aa05-d3e725c33b10"
}
---

# Agent HTML artifacts auto-preview

## Expected behavior

JanusX renders HTML only when a person opens the file by hand. `FileViewerContent` dispatches to `HtmlViewer`, and `BrowserSurface` carries real Chromium tabs, yet an agent that writes `report.html` never surfaces it. The renderer run, editor, and browser stores stay disconnected, and the right-tools registry holds no preview slot. Every generated artifact costs a manual hunt through the file tree.

## Proposal

Deliver in two tiers. The generic tier covers all engines at file level: a main-side `ArtifactDetector` (`src/main/preview/artifact-detector.ts`) takes three inputs by descending priority — explicit `artifact-delta` / `artifact-done` events from janus, `tool-start` / `tool-end` paths ending in `.html` inside the workspace, and a debounced file-watcher fallback scoped to the agent task window. One `sessionId + absolutePath` pushes at most once per 2s; multi-artifact tasks keep an `mtime`-sorted list without stealing a manually switched tab. A renderer `preview-store` routes light reports to the `HtmlViewer` iframe and full apps to `BrowserSurface`, auto-opens within 1s of `tool-end`, and stops re-nudging within a task once the user closes the preview, leaving a badge hint instead. The native tier covers janus only: extend the `AgentEvent` union with `artifact-delta` / `artifact-done`, stream incremental `srcDoc` throttled to 150–300ms, then settle into the file-level artifact. Cap streamed deltas at 2MB and single files at 5MB with an explicit notice. The preview surface itself arrives through the slot registry in `../architecture/2026-09-09-island-rightdock-slots.md`.

## Alternatives considered

- Guess `html` fences from the text stream for all engines — strongest case is zero protocol change on either side. The driver that rules it out is false positives: external CLIs expose no HTML incremental semantics, so fence-sniffing misfires on code discussions.
- Open everything in the browser surface — strongest case is reusing `surface-manager` untouched. The driver that rules it out is carrier weight: a full `WebContentsView` per light report wastes processes and loses task binding.
- Do nothing / reuse manual open — staying put keeps zero new IPC and zero store surface. The cost is that the generate-then-hunt loop persists for every artifact.

## Acceptance criteria

- [ ] AC-1: Any engine writing `*.html` auto-opens the right-side preview within 1s of `tool-end`.
- [ ] AC-2: Overwriting an open artifact refreshes it; manual close suppresses further auto-opens within the task.
- [ ] AC-3: Janus streams incremental rendering and settles to a file-level artifact with open-in-editor, open-in-browser, and copy-path actions.
- [ ] AC-4: The 2MB delta and 5MB file caps trigger truncation plus notice.

## Risks

- The watcher fallback turns noisy without the task-window plus suffix filter; keep both filters mandatory.
- `CodexParser` must first split a real `filePath` out of the assembled `command ?? path ?? query` arg; that extraction gates the tool-path input.
- The janus CLI streaming half lives in the `janus-agentX` repository; this note defines the contract and the JanusX consumer only.
