# Agent Note: Account-system LAN remote control

Status: implemented

## Problem

Team members cannot reach a shared host workspace and terminal through any authorized path. The controlled entry exists as a single-machine prototype with no team session ownership and no transport for snapshots, deltas, resume, or offline queues.

## Decision

Every connection gates on the same account system with two legal shapes: same-account personal devices and same-tenant authorized members. Discovery runs over LAN with five-minute single-use signed pairing codes; the host verifies the controller session plus membership, binds the device, and hands execution to the gateway with membership checks replacing the open-id allowlist. Binding keys and token claims extend with user, tenant, project or team, role, and device; tokens stay minute-lived and single-use under replay protection. Sessions grant view (snapshots plus bounded tail streams) with controlled single-line submit and interrupt only. Sign-out or member disable revokes bindings and tokens immediately with actor and tenant recorded. The status-bar capsule plus modal serves as the standing entry while public relay waits behind the same envelope.

## Alternatives considered

- Full cloud IDE semantics — strongest case reaches any device from anywhere. The driver that rules it out is custody: code and sensitive execution stay on enterprise-controlled hosts with version control as the source of truth.
- Realtime multi-writer terminals — strongest case enables true pairing. The driver that rules it out is sequencing: controlled operation proves itself before shared keystrokes.
- Do nothing / reuse local-only control — staying put avoids all pairing machinery. The cost is that team same-host access stays impossible.

## Consequences

- **Gains**: Same-account and same-tenant machines pair, watch, submit, and interrupt with per-action audit; wrong codes, cross-organization attempts, and disabled members all refuse.
- **Costs and limits**: Public relay stays reserved at the transport layer; project-level granularity and browser entry reuse the same semantics later.
