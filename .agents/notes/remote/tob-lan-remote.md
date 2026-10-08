---
{
  "schema": "harness-note/2",
  "id": "97efe07c-2d7e-54c0-a4ac-a55cb12c8fc3",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-08-20",
  "class": "feature",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-08-20-agent-note-account-system-lan-remote-control--97efe07c.md",
      "sourceHash": "d78bae25aabd8d65227e2e2f38a093ba86ad2387f4b912dad6f20263d5e1b703",
      "originalBodyHash": "67466892e267f2bdff70d69a0bf22b80a1291b7ccf771370207c914a2791f960",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Account-system LAN remote control. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix","Removed lifecycle duplicated by frontmatter"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/feature/2026-08-20-tob-lan-remote.md",
        "sourceHash": "d78bae25aabd8d65227e2e2f38a093ba86ad2387f4b912dad6f20263d5e1b703",
        "originalBodyHash": "67466892e267f2bdff70d69a0bf22b80a1291b7ccf771370207c914a2791f960"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/b653bb34-279f-45db-92d1-313d1c6bcdf5"
}
---
# Account-system LAN remote control


## Problem

Team members cannot reach a shared host workspace and terminal through any authorized path. The controlled entry exists as a single-machine prototype with no team session ownership and no transport for snapshots, deltas, resume, or offline queues.

## Decision

Every connection gates on the same account system with two legal shapes: same-account personal devices and same-tenant authorized members. Discovery runs over LAN with five-minute single-use signed pairing codes; the host verifies the controller session plus membership, binds the device, and hands execution to the gateway with membership checks replacing the open-id allowlist. Binding keys and token claims extend with user, tenant, project or team, role, and device; tokens stay minute-lived and single-use under replay protection. Sessions grant view (snapshots plus bounded tail streams) with controlled single-line submit and interrupt only. Sign-out or member disable revokes bindings and tokens immediately with actor and tenant recorded. The status-bar capsule plus modal serves as the standing entry while public relay waits behind the same envelope.

Arbitrary-network rollout reuses the same envelope in three phases: Tailscale or WireGuard mesh first (no server code, host listens on tailnet plus loopback only), managed tunnel with access policy second (single https plus wss endpoint, per-message short session token plus rate limiting plus audit), self-built relay last (both sides outbound to a cell plus director splice, revocable per-client tokens, protocol version gate, separate push gateway). Raw port forwarding to the public internet stays forbidden; the browser lands as a fourth entry calling the same gateway, never as a cloud IDE holding code.

## Alternatives considered

- Full cloud IDE semantics — strongest case reaches any device from anywhere. The driver that rules it out is custody: code and sensitive execution stay on enterprise-controlled hosts with version control as the source of truth.
- Realtime multi-writer terminals — strongest case enables true pairing. The driver that rules it out is sequencing: controlled operation proves itself before shared keystrokes.
- Do nothing / reuse local-only control — staying put avoids all pairing machinery. The cost is that team same-host access stays impossible.

## Consequences

- **Gains**: Same-account and same-tenant machines pair, watch, submit, and interrupt with per-action audit; wrong codes, cross-organization attempts, and disabled members all refuse.
- **Costs and limits**: Public relay stays reserved at the transport layer; project-level granularity and browser entry reuse the same semantics later. Host-side HTTP/WS listener plus pairing-to-session-token upgrade plus gateway `transport` passthrough land before any relay code; relay swaps carriers without touching gateway semantics, with PTY lease plus grace-period reattach and closed-app session survival borrowed from the Orca reference.
