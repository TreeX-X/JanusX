# Agent Note: In-code contribution slots for Island and RightDock

Status: proposed

## Problem

The Island and the RightDock grow by editing containers. Island views live in a closed union plus a literal render list with local state and scattered stage side effects; the RightDock registry freezes at compile time behind a closed id union, an `if`-chain host, and a total icon record. Each new tab or view touches three to five container files, and three declared auxiliary types stay unwired. Extension cost rises linearly with every feature.

## Proposal

Ship L1 in-code contribution points and nothing more. Add a renderer `extensions/` entry holding a generic contribution store, `registerRightTool()` with an icon registry, `registerIslandView()` plus `registerAuxiliaryModule()` with `useAuxiliary`, and a `builtin.ts` that registers the built-in four right tools, three Island views, and three wired auxiliaries at startup. Containers render from tables and gain no new branches. Wire `knowledge-detail` at minimum; give the remaining two empty implementations plus docs. Carry `persist` across a `v1` to `v2` migration that tolerates unknown ids. Publish an `extensions/README` whose copy-paste example delivers one tab in 30 minutes, using the preview artifact in `../feature/2026-09-09-artifact-preview.md` as the first validation plugin. Reserve the dynamic-loading API shape only; runtime third-party loading stays out of scope.

## Alternatives considered

- Keep editing containers per feature — strongest case is no refactor risk with exhaustive type checks intact. The driver that rules it out is container rot: every addition risks the shared default behaviors and repeats the same five-file patch.
- Jump straight to runtime dynamic loading — strongest case is a real third-party story from day one. The driver that rules it out is premature trust cost: sandboxing, signing, and version skew before any internal consumer proves the slot shape.
- Do nothing / reuse hand patches — staying put avoids all migration risk. The cost is that preview, history, and knowledge surfaces each repeat the multi-file patch.

## Acceptance criteria

- [ ] One new right-side tab ships as a single contribution file plus one register line with no container diff.
- [ ] Existing tools, views, and auxiliaries show zero behavior regression in order, icons, shortcuts, persistence, error isolation, and keep-alive semantics.
- [ ] All three previously unwired auxiliary types land wired or documented-empty.
- [ ] The README example yields a working tab within 30 minutes for a newcomer.

## Risks

- Widening the tool id loses exhaustive checking; pair it with an empty state plus a gate.
- Converging the Island stage side effects can alter default semantics; lock `data-view` selectors and the three default behaviors in E2E.
- Keep-alive growth needs the `keepAlive:false` convention plus real measurement before declaring victory.
