---
{
  "schema": "harness-note/2",
  "id": "48db2e15-9318-5068-b300-b1913abf5463",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-07-11",
  "class": "feature",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-07-11-agent-note-embedded-browser-surface--48db2e15.md",
      "sourceHash": "13cf5ef4f753cba639f3ab4de9eff7829dad1c4e312c6e6dccba9ed20e1154a1",
      "originalBodyHash": "3e89eaa1285dcd2443c6a58d8d570c12a20bd459651e9a33064d3fd96f8a9ba6",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Embedded browser surface. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix","Removed lifecycle duplicated by frontmatter"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/feature/2026-07-11-browser-surface.md",
        "sourceHash": "13cf5ef4f753cba639f3ab4de9eff7829dad1c4e312c6e6dccba9ed20e1154a1",
        "originalBodyHash": "3e89eaa1285dcd2443c6a58d8d570c12a20bd459651e9a33064d3fd96f8a9ba6"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/3a4dc304-70dd-49e4-b46a-ee2fc0fbc83e"
}
---
# Embedded browser surface


## Problem

Agents manipulate code and files but never touch the live web runtimes their changes serve. Verifying a fix means leaving the workspace for an external browser, and running dev servers stay invisible to the working context.

## Decision

The workspace embeds a real browsing panel on isolated per-tab views with a persistent partition. Entry points span dedicated tabs, sidebar shortcuts, running-project links, editor handoff, and terminal URL recognition. Sandboxed local preview keeps serving static artifacts while the full surface handles scripted pages, routing, and dev servers. Agent operation of the surface stays out: no page scripting from agents, no host interface exposure, and no main-side client integration in this scope.

## Alternatives considered

- External browser handoff — strongest case needs no new carrier. The driver that rules it out is context loss: verification leaves the workspace it belongs to.
- Full browser product — strongest case covers bookmarks, history, and downloads. The driver that rules it out is scope: the panel serves tasks, not browsing as a destination.
- Do nothing / reuse sandboxed preview — staying put covers static artifacts. The cost is every live page still opens elsewhere.

## Consequences

- **Gains**: Dev servers, local previews, and documentation resolve inside the workspace beside the code that serves them.
- **Costs and limits**: Each tab carries a full view process, so tab count needs bounding; agent-driven operation awaits its own protocol, switch, and audit pass.
