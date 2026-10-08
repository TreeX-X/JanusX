---
{
  "schema": "harness-note/2",
  "id": "8ac68f05-8b94-52c1-809a-b75176904195",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-04",
  "class": "architecture",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-04-agent-note-remote-control-direction-and-gateway--8ac68f05.md",
      "sourceHash": "a783046f60940ae7e9b85408ed5a407558262acf7301b96b313ff64f01b9320b",
      "originalBodyHash": "fd9a9f569b7e0c65ec52a68ecde28f2ce18b12b7f6c8b10c32e9e3e0add3f175",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Remote control direction and gateway. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix","Removed lifecycle duplicated by frontmatter"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/architecture/2026-09-04-remote-control.md",
        "sourceHash": "a783046f60940ae7e9b85408ed5a407558262acf7301b96b313ff64f01b9320b",
        "originalBodyHash": "fd9a9f569b7e0c65ec52a68ecde28f2ce18b12b7f6c8b10c32e9e3e0add3f175"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/b653bb34-279f-45db-92d1-313d1c6bcdf5"
}
---
# Remote control direction and gateway


## Problem

Remote proposals pull toward full desktop sharing while the product needs session supervision. Pixel streams, key injection, and third-party kernels solve a different product and drag device-level risk into a workflow tool.

## Decision

The remote object is the session and workflow, never the machine desktop. Structured state plus a command whitelist replaces screen sharing; full desktop kernels stay rejected and pointer or pixel paths stay out of scope. Three entries share one execution core: a rich self-built control surface, a lightweight chat-channel entry, and a direct client-to-client link, all fronted by one host-side gateway as the sole trust boundary. Remote sides transmit authorized intents only and never touch shells or filesystems directly. Reads lead by default with graded, auditable, revocable writes. The account-system link edition continues in `../feature/2026-08-20-tob-lan-remote.md`.

Orca (`stablyai/orca`, MIT) validates this direction and supplies the concrete reference: desktop remains the source of truth while mobile stays a read-mostly remote control (worktree status, terminal scrollback, short replies, Quick Commands, file tree, small source-control follow-ups), not a full editor. Its run modes split remote into Local, SSH worktrees, Remote Orca Server (`orca serve`), and per-workspace Cloud VM recipes (`orca.yaml`), with SSH for laptop-owned runtime and Server for shared persistent runtime. Transport is a versioned WebSocket RPC on `:6768` (pairing QR encodes endpoint plus device token plus TLS/X25519 fingerprint, `DESKTOP_PROTOCOL_VERSION`/`MOBILE_PROTOCOL_VERSION` gate incompatible pairs), LAN/Tailscale preferred with a relay cell plus director for NAT traversal, and a separate APNs/FCM push gateway where the desktop holds the credential. Local development uses `mobile/pnpm mock-server` plus `terminal.subscribe` repro scripts so UI work proceeds without a phone. See the Orca survey in [desktop ADE MIT survey](../desktop/desktop-ade-mit-survey.md).

## Alternatives considered

- Full desktop kernel inside the product — strongest case covers every remote need at once. The driver that rules it out is product mismatch: device control is not session supervision.
- Chat-channel only — strongest case ships on existing messaging rails. The driver that rules it out is a capability ceiling: rich interaction never fits message cards.
- Do nothing / reuse local-only operation — staying put avoids all pairing and relay machinery. The cost is no supervision beyond arm's reach.

## Consequences

- **Gains**: One gateway, one permission model, and one audit shape serve all three entries; new entries may only call the gateway. Orca confirms the borrowable mechanics: PTY lease surviving app close with grace-period reattach, port forwarding from remote listeners, revocable per-client tokens, and mock-server plus no-phone repro scripts for mobile UI work.
- **Costs and limits**: Rich interaction concentrates on the self-built surface while the chat entry stays deliberately thin; relay transport swaps carriers without touching semantics. Mobile protocol lag (App Store review delay) requires a version compat gate from day one; iOS Simulator stays Mac-only so Windows-side iOS testing must rely on Expo Go physical devices plus EAS cloud builds plus mock, not on a local simulator. Current gateway scope (`status/terminals/bind/follow-up/stop/approve`, `lan` only) stays JS plus WebSocket text so Expo Go suffices for development; background push (APNs/FCM with killed-app delivery), pairing plus secure-store formalization, rich terminal or attachments or custom WebView engines, and TestFlight or internal distribution each require an EAS dev-client plus cloud build.
