---
{
  "schema": "harness-note/2",
  "id": "671574ba-c6e4-54ab-8fee-8d762e72f622",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-07-05",
  "class": "feature",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-07-05-agent-note-custom-desktop-toast-window--671574ba.md",
      "sourceHash": "7e68aaeee8319652ce17f82a77edbc14fecaf60bbdf511020d07657c626c33f3",
      "originalBodyHash": "6b859f349d9a09d0732157d68518229646dfc6a106e87bdd1c85a568a8f1add3",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Custom desktop toast window. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix","Removed lifecycle duplicated by frontmatter"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/feature/2026-07-05-desktop-toast.md",
        "sourceHash": "7e68aaeee8319652ce17f82a77edbc14fecaf60bbdf511020d07657c626c33f3",
        "originalBodyHash": "6b859f349d9a09d0732157d68518229646dfc6a106e87bdd1c85a568a8f1add3"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/3a4dc304-70dd-49e4-b46a-ee2fc0fbc83e"
}
---
# Custom desktop toast window


## Problem

System notification delivery fails silently across packaging variants. Portal builds, notification-center permissions, and shortcut registration drift apart, so task completion pings vanish exactly when background runs need them most.

## Decision

Local reminders leave the system notification path for a dedicated toast window. An independent window renders Janus toast styling above minimized or backgrounded main frames, while in-app toasts keep serving active sessions. Activating a desktop toast restores and focuses the main window at the owning terminal. The remote notification channel stays independent and never renders through the local toast. Replacement semantics govern the window: the newest reminder supersedes the current one with no stacking and no history center.

## Alternatives considered

- Repair system notification integration — strongest case stays native everywhere. The driver that rules it out is platform variance: each packaging quirk reopens the same failure class.
- Third-party notification library — strongest case buys stacking and history. The driver that rules it out is dependency weight for a single-window need.
- Do nothing / reuse system notifications — staying put keeps zero custom chrome. The cost is reminders that vanish by packaging luck.

## Consequences

- **Gains**: Toast delivery stands independent of shortcut and permission state; styling and behavior stay consistent across installs.
- **Costs and limits**: A second window joins the lifecycle with its own readiness handshake; stacking and history stay explicitly out.
- **Transparency over blur**: The toast page carries transparent `html`/`body` from pre-paint (an inline `toast-prepaint` hook in the renderer entry plus a synchronous class attach before React mounts), the viewport carries zero padding so the card fills the window with no transparent ring for DWM to paint, the card paints as a solid surface without `backdrop-filter`, and the window opts out of native shadow, thick frame, DWM system backdrop (`backgroundMaterial:none`, reasserted around show), and system rounded corners (rounding stays owned by the CSS card). The in-app twin paints the same solid card without `backdrop-filter`. Transparency holds on Windows, where backdrop blur degrades transparent compositing into a gray halo and the default `auto` material paints Mica gray behind the rounded card. The cost is the loss of background blur behind the card, which the near-opaque surface keeps visually negligible.
- **Hide clears the frame**: Every main-side hide broadcasts `desktop-toast:hide` so the renderer drops toast state while hidden; a superseding reminder paints over an empty transparent frame instead of flashing the previous one.
