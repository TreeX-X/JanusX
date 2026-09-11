# Agent Note: Checkpoint snapshot safety

Status: implemented

## Problem

Snapshot creation corrupts the workspace it records. Capturing a checkpoint first stashes tracked and untracked changes, so the snapshot stores post-stash state while the working tree looks reverted. Later messages appear to auto-restore, fresh uncommitted work vanishes from view, and recovery can never return the lost content. Recording, stashing, and restoring tangle into one gesture.

## Decision

Snapshots observe and never mutate. Creation bans stash, checkout, reset, automatic merge, automatic restore, and automatic pop or apply. Restore fires only on explicit user confirmation; messages, terminal switches, workspace switches, list refreshes, panel opens, and status polls never trigger it. The main workspace stays a user asset with agent execution isolated from it. Every destructive operation takes a pre-operation snapshot first. Merge conflicts surface to the interface layer instead of resolving silently underneath. The tree carries zero stash calls on the checkpoint path with content-addressed file snapshots behind the handler.

## Alternatives considered

- Keep stash-based capture — strongest case reuses version control for free. The driver that rules it out is semantic inversion: the snapshot records the wrong state and the loop never recovers.
- Silent auto-merge on restore — strongest case removes clicks from recovery. The driver that rules it out is silent loss: conflict judgment belongs to the user, never to the layer.
- Do nothing / reuse coupled capture — staying put avoids all migration work. The cost is the permanent record-restore ghost loop.

## Consequences

- **Gains**: Snapshots record true workspace state; restore surprises end because only explicit confirmation restores.
- **Costs and limits**: Blob storage plus pre-operation copies grow with checkpoint volume; retention policy owns the ceiling and its revisit signal.
