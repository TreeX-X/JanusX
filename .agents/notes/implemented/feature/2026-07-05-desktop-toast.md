# Agent Note: Custom desktop toast window

Status: implemented

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
- **Transparency over blur**: The toast page carries transparent `html`/`body` from pre-paint (an inline `toast-prepaint` hook in the renderer entry plus a synchronous class attach before React mounts), the card paints as a solid surface without `backdrop-filter`, and the window opts out of native shadow and thick frame. Transparency holds on Windows, where backdrop blur degrades transparent compositing into a gray halo. The cost is the loss of background blur behind the card, which the near-opaque surface keeps visually negligible.
- **Hide clears the frame**: Every main-side hide broadcasts `desktop-toast:hide` so the renderer drops toast state while hidden; a superseding reminder paints over an empty transparent frame instead of flashing the previous one.
