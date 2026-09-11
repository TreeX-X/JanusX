# Agent Note: Team identity with local email provider

Status: proposed

## Problem

The workspace model knows one machine and no organization. No tenant, user, team, role, or resource-level access list exists, so shared blueprints, shared knowledge, and team resources cannot open safely. Identity is the footing every sharing capability stands on.

## Proposal

Ship a local email provider first with an adapter seam for the rest. Registration builds an account only; organizations come from an explicit create step, and invitation codes join accounts to organizations. One email maps to one user across many tenants with per-tenant roles (Owner, Maintainer, Contributor, Viewer); the client holds an active tenant id and authorizes every level beneath it. The login gate stays skippable so single-machine use never breaks, and team surfaces re-prompt only when touched. Add a pinned team footer with an organization switcher, a team tab in settings, and a setup gate mirroring the existing office gate. Define the `IdentityAdapter` contract now (login, user fetch, org sync, leave hook) and leave enterprise chat login plus standard-protocol providers as later implementations without remodeling.

## Alternatives considered

- Enterprise chat SSO first — strongest case reuses the corporate directory for identity and initial org shape. The driver that rules it out is deployment coupling: per-tenant app configs, variable directory permissions, and broken offline plus private-deploy use.
- Standards-only login — strongest case is a clean protocol boundary from day one. The driver that rules it out is the same missing interior: the internal tenant and permission model must exist first, and no customer provider waits on day one.
- Do nothing / reuse single-machine accounts — staying put avoids all account machinery. The cost is that no shared read can open safely.

## Acceptance criteria

- [ ] One organizer invites a second member who sees only authorized projects; disabling revokes shared blueprint and knowledge access immediately.
- [ ] One email joins several organizations with independent per-organization roles, and switching organizations switches data plus permission context.
- [ ] The login gate skips cleanly with all single-machine features intact; team entries re-prompt for login when touched.

## Risks

- Invitation codes need expiry plus single use, or stale codes become a quiet backdoor.
- Directory sync later must never replace the internal mapping table; external departments are not project permissions.
