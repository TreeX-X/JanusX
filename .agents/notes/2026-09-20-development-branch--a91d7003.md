---
schema: harness-note/1
id: a91d7003-a6f4-4dd8-9975-e587c1b0f26f
kind: decision
lifecycle: implemented
created: 2026-09-20
parent: note://972afef3-2fc7-49de-a3ee-7e041225d28c/3a4dc304-70dd-49e4-b46a-ee2fc0fbc83e
class: process
tags: [git, ci]
---

# Develop changes on a persistent integration branch

## Problem

A repair branch that accumulates unrelated feature work hides its purpose and delays integration. Development needs a predictable destination while the stable branch retains validation and review requirements.

## Decision

`develop` holds bounded batches of development; `main` holds integrated changes. The Windows verification workflow runs on pushes to both branches and on proposed merges into `main`. Development reaches `main` only after verification and the repository's required review conditions are satisfied.

Merges from the persistent development branch retain history through merge commits. Synchronizing `main` back to `develop` keeps their shared ancestry and prevents repeated squash comparisons. `CONTRIBUTING.md` defines the fast-forward synchronization commands and requires conflict resolution and verification when development has advanced independently. Temporary feature branches are removed after integration; website and active worktree branches have separate lifecycles.

## Alternatives considered

- Keep only short-lived feature branches: this provides clear isolation but does not provide the requested stable destination for everyday development.
- Reuse the repair branch indefinitely / do nothing: this avoids setup but keeps misleading names and encourages unrelated changes to accumulate.
- Squash every integration: this keeps the main log compact but loses shared ancestry with a persistent development branch, increasing repeated comparisons and conflict handling.

## Consequences

Developers have one named development destination, with automatic checks before integration. An open integration request and a development push may both run verification, increasing CI usage in exchange for checking both the branch and its merge result. Maintainers must synchronize after integration and keep batches bounded. Concurrent teams may need short-lived feature branches when a shared development branch causes interference. Main branch protection remains authoritative; creating `develop` does not grant review exceptions.
