# Agent Note: Account-system LAN remote control

Status: proposed

## Problem

The controlled terminal entry exists as a single-machine prototype with no team session ownership and no transport layer for snapshots, deltas, resume, or offline queues. Team members cannot reach a shared host workspace and terminal through any authorized path.

## Proposal

Gate every connection on the same account system with no separate remote account. Discover over LAN with short-lived signed pairing codes, verify the controller session plus same-organization membership, bind the device, then hand off to the existing gateway execution with membership checks replacing the open-id allowlist. Extend binding scope keys and token claims with user, tenant, project or team, role, and device; keep tokens minute-lived and single-use with replay protection. Ship view plus controlled operation only (watch the tail, submit one line, interrupt) over the transport floor in `2026-08-20-tob-transport.md`; leave multi-writer terminals and cloud IDEs out. Sign out or member disable revokes bindings and tokens immediately with actor and tenant recorded. Reserve the relay swap for later with identical envelopes, tokens, and audit.

## Alternatives considered

- Full cloud IDE semantics — strongest case reaches any device from anywhere. The driver that rules it out is custody: code and sensitive execution stay on enterprise-controlled hosts with version control as the source of truth.
- Realtime multi-writer terminals — strongest case enables true pairing. The driver that rules it out is sequencing: controlled operation must prove itself before shared keystrokes.
- Do nothing / reuse local-only control — staying put avoids all pairing machinery. The cost is that team same-host access stays impossible.

## Acceptance criteria

- [ ] Two machines on one account pair over LAN and hold a session through membership checks.
- [ ] Watching output, submitting one line, and interrupting all take effect with trace records.
- [ ] Wrong codes, cross-organization attempts, and disabled members all refuse.

## Risks

- Pairing-code lifetime needs a tight bound with signed payloads, or codes wander.
- Public relay later must swap transport selection only; any semantic drift forks the protocol.
