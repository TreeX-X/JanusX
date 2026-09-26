---
schema: harness-note/1
id: 19cd1394-b2cb-4819-8fde-5f12de16574c
kind: initiative
lifecycle: accepted
created: 2026-09-26
class: architecture
tags: [product, surface, parent, governance]
---

# 产品面父域

## Goal

Island、右 Dock、产物工作区与 Note 工具链共三十篇，演进链完整但无父。本域按槽位演进、产物语义、工具链三组收拢，右列改动先定位本域。

## Scope

槽位演进链（非重复，保留先后）：[island-slots](./2026-09-09-island-rightdock-slots--eaa097ff.md)、[right-dock](./2026-07-19-right-dock--a73f2f05.md)、[empty-collapse](./2026-09-16-right-dock-empty-collapse--9f855a20.md)、[drawer-resize](./2026-09-19-runtime-drawer-cards-resize--faacdaf7.md)、[run-orb](./2026-09-09-run-orb-budding--80e64e6f.md)、[hifi-alignment](./2026-09-13-island-hifi-optimized-alignment--e22d4cdb.md)、[capsule](./2026-09-13-island-notification-capsule--ada1e07a.md)；turn 双件[island](./2026-09-21-turn-change-island--2f49a04f.md)与[card](./2026-09-21-turn-change-card-external-cli--82bea9ca.md)同属本域。

产物语义：[workspace 重构](./2026-09-13-product-workspace--034fb695.md)、[notice-matrix](./2026-09-13-product-notice-matrix--c4b9de4e.md)、[peek-race](./2026-09-13-product-peek-width-and-close-race--fd4aef5f.md)、[preview-p0](./2026-09-17-product-preview-p0--99b3fb78.md)、[tour](./2026-09-18-product-tour--609e58ef.md)、[landing](./2026-09-17-landing-page--85cfee57.md)。

Note 工具链三件各司其职：[drawer-toolbar](./2026-09-19-note-drawer-markdown-toolbar--b327657e.md)、[mechanical-gates](./2026-09-19-note-mechanical-checks--3b7d1e9b.md)、[rename-draftcard](./2026-09-22-notecard-rename-draft-card--387ee6c3.md)；工作便签归属：[own-namespace implemented](./2026-09-18-own-notes-namespace--5559a0b8.md)与[own-namespace proposed](./2026-09-18-own-notes-namespace--134ce6f7.md)为生命周期对，成对保留。

配套：[github-maintenance](./2026-09-17-github-maintenance--a568cc88.md)、[markdown-assets](./2026-09-18-markdown-preview-local-assets--64286344.md)、[file-glyph](./2026-09-21-drawer-markdown-file-glyph--77c7030e.md)、[reveal-race](./2026-09-21-file-tree-reveal-race--80f207b2.md)、[share-import](./2026-09-19-share-import--eece2e89.md)、[plugin-forms](./2026-09-09-plugin-architecture-forms--96a2f5cd.md)、[plugin-debug](./2026-09-09-plugin-import-debug--80e8b427.md)、[entry-nav](./2026-09-19-entry-switch-navigation--2a6cd90c.md)、[f12-nav](./2026-08-14-f12-navigation--8e32dd4e.md)、[pelican](./2026-09-19-pelican-bicycle--5996294e.md)（合法独立交付，非残留）。

## Acceptance criteria

- [x] AC-1: 本域 30 篇直接子全部携带有效 parent。
- [ ] AC-2: own-namespace 生命周期对保留两篇，不判重复删除。
- [ ] AC-3: pelican 与 migrated 样例区分，前者为功能保留，后者维持历史隔离。
