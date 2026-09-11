# Proposal: Team approval and governance platform

Status: exploring
Date: 2026-08-20

## Background

The team sharing decision settles identity, shared resources, and transport first. Approval flows, organization policy, unified audit, metering, and platform surfaces stay explicitly deferred with only field reservations (`tenantId`, `actorId`, `policyVersion`). This entry keeps the deferred direction without blocking the confirmed scope.

## Options

- A: build governance alongside the team base — full approval and policy story from the start at the cost of slowing the sharing floor.
- B: build governance as a later standalone stage on the reserved fields — fast base now, explicit migration surface later.
- Do nothing — the local execution policy stays the only policy and audits stay per-domain.

## Recommendation

No recommendation yet. The confirmed decision holds: base first, governance later.

## Scope if adopted

Expected child boundaries cover agent high-risk approval, multi-person changeset review, organization policy center, unified audit with export, secrets plus model plus cost governance, and the admin plus integration platform. Audit and policy touch every domain service; no new execution primitives.

## Open questions

- Is the target customer private deployment or cloud service? The answer shapes config, callback, and host architecture.
- Which external identity providers do customers actually demand before any adapter beyond the local one ships?
