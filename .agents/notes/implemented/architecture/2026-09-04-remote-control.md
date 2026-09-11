# Agent Note: Remote control direction and gateway

Status: implemented

## Problem

Remote proposals pull toward full desktop sharing while the product needs session supervision. Pixel streams, key injection, and third-party kernels solve a different product and drag device-level risk into a workflow tool.

## Decision

The remote object is the session and workflow, never the machine desktop. Structured state plus a command whitelist replaces screen sharing; full desktop kernels stay rejected and pointer or pixel paths stay out of scope. Three entries share one execution core: a rich self-built control surface, a lightweight chat-channel entry, and a direct client-to-client link, all fronted by one host-side gateway as the sole trust boundary. Remote sides transmit authorized intents only and never touch shells or filesystems directly. Reads lead by default with graded, auditable, revocable writes. The account-system link edition continues in `../feature/2026-08-20-tob-lan-remote.md`.

## Alternatives considered

- Full desktop kernel inside the product — strongest case covers every remote need at once. The driver that rules it out is product mismatch: device control is not session supervision.
- Chat-channel only — strongest case ships on existing messaging rails. The driver that rules it out is a capability ceiling: rich interaction never fits message cards.
- Do nothing / reuse local-only operation — staying put avoids all pairing and relay machinery. The cost is no supervision beyond arm's reach.

## Consequences

- **Gains**: One gateway, one permission model, and one audit shape serve all three entries; new entries may only call the gateway.
- **Costs and limits**: Rich interaction concentrates on the self-built surface while the chat entry stays deliberately thin; relay transport swaps carriers without touching semantics.
