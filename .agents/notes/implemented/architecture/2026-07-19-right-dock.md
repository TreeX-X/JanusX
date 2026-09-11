# Agent Note: Right dock rail with semantic file icons

Status: implemented

## Problem

The right side freezes four singleton tabs in a fixed strip while the file tree speaks no visual language. Adding a tool squeezes the tab row, tool state drifts across stores, and file kinds, selection, and version-control states collide in one channel.

## Decision

The right side composes a fixed tool rail, open tool tabs, and a variable-width panel. Tools stay open in multiples with exactly one visible, each tool runs as a singleton, and registry order fixes tab sequence with no drag sorting. Collapse keeps a single source of truth and tool business state follows existing stores per workspace. File icons lead with semantic shape plus low-saturation color inside the monochrome-plus-accent language, and file kind, selection, and version-control states travel three independent visual channels. Icon taxonomy shares one source with the file viewer classification. Office preview stays a transient middle workspace outside the rail.

## Alternatives considered

- Per-tool windows — strongest case gives every tool full space. The driver that rules it out is frame fragmentation: tools scatter beyond the working context.
- Repeatable tool instances — strongest case mirrors document tabs. The driver that rules it out is semantic mismatch: tools are capability entries, not documents.
- Full-color file icons — strongest case reads faster at a glance. The driver that rules it out is noise: saturated rainbows fight the restrained shell.
- Do nothing / reuse fixed tabs — staying put avoids all migration risk. The cost is an unextendable strip and a mute file tree.

## Consequences

- **Gains**: New tools arrive through registry order without squeezing chrome; file kinds read instantly across tree and viewer from one taxonomy.
- **Costs and limits**: Singleton tools cannot split side by side; drag sorting and pinning stay explicitly out until range pressure demands them.
