---
schema: harness-note/1
id: 19cd1394-b2cb-4819-8fde-5f12de16574c
kind: initiative
lifecycle: accepted
created: 2026-09-26
class: architecture
tags: [product, surface, architecture:module]
relations:
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/93151b7b-6a33-5e5d-bf83-f2109fc85389
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/b1978fa7-4732-553a-83c3-12aefd34c248
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/671574ba-c6e4-54ab-8fee-8d762e72f622
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/48db2e15-9318-5068-b300-b1913abf5463
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/b32f92b5-0256-5402-8a15-d19e9fa4db73
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/5c873080-4f76-597f-9fbd-0bdcc59a02a3
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/8688b5ab-1f7f-5ff9-ba1b-ef75b7fd5917
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/c0b4743b-71be-462a-97da-27e40bc5d67a
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/a162efb4-23a7-4468-95e6-7163fe7efdc0
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/7b4800da-0ea0-4f63-9f15-7ce60e721bd7
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/b6df1d4e-3a6c-47f3-a062-48e6867f9d0f
parent: note://972afef3-2fc7-49de-a3ee-7e041225d28c/b2e7f160-2d77-4cc4-8828-b9cf3e5d931a
codeRefs:
  - repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
    path: src/renderer/src/components/right-tools/RightDock.tsx
    symbol: RightDock
    role: entry
  - repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
    path: src/renderer/src/components/product-workspace/ProductWorkspacePanel.tsx
    symbol: ProductWorkspacePanel
    role: implementation
  - repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
    path: src/renderer/src/components/janus/JanusIsland.tsx
    symbol: JanusIsland
    role: implementation
---

# 工作台与产物界面

## Goal

组织 Island、右侧工具栏、产物预览与共享编辑器的交互和视觉。RightDock 负责工具承载与布局，ProductWorkspacePanel 负责生成文件的预览，JanusIsland 负责工作状态及通知入口。文件事实由既有读取服务提供，会话耐久、Agent 执行与工程 Note 事务分别由对应模块负责。

## Scope

负责布局、预览、导航及可达交互，不承诺所有插件、主题或预览提案均已交付。下面保留历史阅读链，Note 工具的界面承载在本模块，文档身份和蓝图解析见 [Note 与蓝图](./2026-10-03-module-note-blueprint--f12d99b4.md)。

槽位演进链（非重复，保留先后）：[island-slots](./2026-09-09-island-rightdock-slots--eaa097ff.md)、[right-dock](./2026-07-19-right-dock--a73f2f05.md)、[empty-collapse](./2026-09-16-right-dock-empty-collapse--9f855a20.md)、[drawer-resize](./2026-09-19-runtime-drawer-cards-resize--faacdaf7.md)、[run-orb](./2026-09-09-run-orb-budding--80e64e6f.md)、[hifi-alignment](./2026-09-13-island-hifi-optimized-alignment--e22d4cdb.md)、[capsule](./2026-09-13-island-notification-capsule--ada1e07a.md)；turn 双件[island](./2026-09-21-turn-change-island--2f49a04f.md)与[card](./2026-09-21-turn-change-card-external-cli--82bea9ca.md)同属本域。

产物语义：[workspace 重构](./2026-09-13-product-workspace--034fb695.md)、[notice-matrix](./2026-09-13-product-notice-matrix--c4b9de4e.md)、[peek-race](./2026-09-13-product-peek-width-and-close-race--fd4aef5f.md)、[preview-p0](./2026-09-17-product-preview-p0--99b3fb78.md)、[tour](./2026-09-18-product-tour--609e58ef.md)、[landing](./2026-09-17-landing-page--85cfee57.md)。

Note 工具链三件各司其职：[drawer-toolbar](./2026-09-19-note-drawer-markdown-toolbar--b327657e.md)、[mechanical-gates](./2026-09-19-note-mechanical-checks--3b7d1e9b.md)、[rename-draftcard](./2026-09-22-notecard-rename-draft-card--387ee6c3.md)；工作便签归属：[own-namespace implemented](./2026-09-18-own-notes-namespace--5559a0b8.md)与[own-namespace proposed](./2026-09-18-own-notes-namespace--134ce6f7.md)为生命周期对，成对保留。

配套：[github-maintenance](./2026-09-17-github-maintenance--a568cc88.md)、[markdown-assets](./2026-09-18-markdown-preview-local-assets--64286344.md)、[file-glyph](./2026-09-21-drawer-markdown-file-glyph--77c7030e.md)、[reveal-race](./2026-09-21-file-tree-reveal-race--80f207b2.md)、[share-import](./2026-09-19-share-import--eece2e89.md)、[plugin-forms](./2026-09-09-plugin-architecture-forms--96a2f5cd.md)、[plugin-debug](./2026-09-09-plugin-import-debug--80e8b427.md)、[entry-nav](./2026-09-19-entry-switch-navigation--2a6cd90c.md)、[f12-nav](./2026-08-14-f12-navigation--8e32dd4e.md)。

渲染与编辑器：[emphasis](./2026-09-27-markdown-emphasis-orange-text--0d703ca1.md)（强调色去填充块）、[standalone-refresh](./2026-09-27-standalone-editor-auto-refresh--fe22dc2d.md)（独立编辑器外部变更自刷新）。

## Acceptance criteria

以下为 2026-09-26 整理的历史验收，原编号、条文与勾选状态保留给已有 Task。篇数与迁移样例记录不代表当前范围。

- [x] AC-1: 本域 31 篇直接子全部携带有效 parent。
- [ ] AC-2: own-namespace 生命周期对保留两篇，不判重复删除。
- [ ] AC-3: 历史迁移样例已清理（2026-09-27 随鹈鹕骑行 Note 一并移除），不再保留隔离样例。
