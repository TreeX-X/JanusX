# Agent Note: Embedded browser surface

Status: implemented

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
