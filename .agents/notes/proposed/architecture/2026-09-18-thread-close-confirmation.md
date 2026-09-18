# Agent Note: Thread close needs a user decision

Status: proposed

## Problem

Task-bound threads outlive every turn, but nothing defines when one may end.
The agentX proposals only say the whole task destroys its threads on
completion and that humans keep an override. Under that rule a finished run
silently deletes the thread its repairs might still need, and no checkout
distinguishes an idle thread from a dead one. Desktop runs need an explicit
close rule before the thread registry and activation entries land.

## Proposal

A thread closes through exactly two doors. The user declares removal, and
the thread is destroyed. Or the main agent proposes closure, the desktop pops
a confirmation carrying the task, the receipts, and the reason, and the user
confirms; only then is the thread destroyed. Completion never closes a
thread by itself: a done run parks its thread idle with receipts intact.
Closing removes the local thread file and the registry entry, never the task
Note, the receipts, or the run record. Idle threads stay resumable, keep
their lease behavior, and cost no concurrency slot.

## Alternatives considered

- Destroy on task completion as the agentX drafts describe: zero bookkeeping,
  but repairs after completion lose their thread and the close is invisible.
- Main-agent close without confirmation: fastest cleanup, but contradicts
  the human-override direction and risks deleting evidence context silently.
- Reference-counted auto close on idle timeout: self-cleaning, but timeouts
  guess user intent and add a second lifecycle clock next to leases.
- Do nothing / reuse: leave threads append-only forever; rejected because
  the registry fills with dead threads and activation cannot tell idle from
  abandoned.

## Acceptance criteria

- [ ] Done runs park idle with receipts; no path destroys a thread on completion alone.
- [ ] User-declared removal destroys the thread file plus the registry entry while Notes, receipts, and run records survive.
- [ ] Main-agent proposals pop a confirmation with task, receipts, and reason; dismissal keeps the thread idle.
- [ ] Activation of an idle thread reattaches its history and model endpoint without re-reading the world.

## Risks

- Idle threads accumulate: the registry must show last activity so stale
  threads are closable on purpose, not by timeout guessing.
- Confirmation fatigue: proposals fire only when the main agent judges the
  thread done, never per attempt or per receipt.
