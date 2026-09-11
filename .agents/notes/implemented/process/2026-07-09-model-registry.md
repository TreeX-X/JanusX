# Agent Note: Unified model registry with OpenRouter sync

Status: implemented

## Problem

Model capability data comes from three unreliable mouths: hardcoded limits, rough estimates, and runtime telemetry fields. Context windows disagree across surfaces because no single traceable source exists.

## Decision

One registry owns model metadata: names, sources, context windows, output caps, capabilities, and pricing. Context reads resolve from the registry before any estimate. OpenRouter serves as the sole automatic sync source, generating the built-in dataset bounded to recently created models. Fuzzy matching reconciles user input, provider names, and registry ids. Built-in lists, remote-update caches, and manual overrides layer in that order, and freshness metadata lets the interface show data age.

## Alternatives considered

- Per-provider live fetching — strongest case is always-fresh data. The driver that rules it out is multiplicative fragility: every provider outage becomes a capability outage.
- Manual curation only — strongest case is full editorial control. The driver that rules it out is staleness velocity: model releases outrun editors within weeks.
- Do nothing / reuse hardcoded limits — staying put needs no pipeline. The cost is permanently disagreeing context displays.

## Consequences

- **Gains**: Every capability and context surface reads one versioned table with visible freshness; overrides stay explicit and auditable.
- **Costs and limits**: Sync cadence bounds freshness and generation stays single-sourced until a second provider proves its schema.
