---
{
  "schema": "harness-note/2",
  "id": "19cd1394-b2cb-4819-8fde-5f12de16574c",
  "kind": "module",
  "lifecycle": "accepted",
  "created": "2026-09-26",
  "class": "architecture",
  "tags": ["product","surface"],
  "relations": [
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/93151b7b-6a33-5e5d-bf83-f2109fc85389"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/b1978fa7-4732-553a-83c3-12aefd34c248"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/671574ba-c6e4-54ab-8fee-8d762e72f622"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/48db2e15-9318-5068-b300-b1913abf5463"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/b32f92b5-0256-5402-8a15-d19e9fa4db73"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/5c873080-4f76-597f-9fbd-0bdcc59a02a3"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/8688b5ab-1f7f-5ff9-ba1b-ef75b7fd5917"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/c0b4743b-71be-462a-97da-27e40bc5d67a"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/a162efb4-23a7-4468-95e6-7163fe7efdc0"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/7b4800da-0ea0-4f63-9f15-7ce60e721bd7"}
  ],
  "parent": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/b2e7f160-2d77-4cc4-8828-b9cf3e5d931a",
  "codeRefs": [
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/renderer/src/components/right-tools/RightDock.tsx",
      "symbol": "RightDock",
      "role": "entry"
    },
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/renderer/src/components/product-workspace/ProductWorkspacePanel.tsx",
      "symbol": "ProductWorkspacePanel",
      "role": "implementation"
    },
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/renderer/src/components/janus/JanusIsland.tsx",
      "symbol": "JanusIsland",
      "role": "implementation"
    }
  ],
  "updated": "2026-10-08T03:43:45.319Z",
  "moduleState": "partial"
}
---

# 工作台与产物界面

## Responsibility

组织 Island、右侧工具栏、产物预览与共享编辑器的交互和视觉。RightDock 负责工具承载与布局，ProductWorkspacePanel 负责生成文件的预览，JanusIsland 负责工作状态及通知入口。文件事实由既有读取服务提供，会话耐久、Agent 执行与工程 Note 事务分别由对应模块负责。

## Design

负责布局、预览、导航及可达交互，不承诺所有插件、主题或预览提案均已交付。下面保留历史阅读链，Note 工具的界面承载在本模块，文档身份和蓝图解析见 [Note 与蓝图](../blueprint/module.md)。

槽位演进链（非重复，保留先后）：[island-slots](./requirements/island-rightdock-slots.md)、[right-dock](./right-dock.md)、[empty-collapse](./right-dock-empty-collapse.md)、[drawer-resize](./runtime-drawer-cards-resize.md)、[run-orb](./run-orb-budding.md)、[hifi-alignment](./island-hifi-optimized-alignment.md)、[capsule](./island-notification-capsule.md)；turn 双件[island](./turn-change-island.md)与[card](./turn-change-card-external-cli.md)同属本域。

产物语义：[workspace 重构](./product-workspace.md)、[notice-matrix](./product-notice-matrix.md)、[peek-race](./product-peek-width-and-close-race.md)、[preview-p0](./product-preview-p0.md)、[tour](./product-tour.md)、[landing](../desktop/landing-page.md)。

Note 工具链三件各司其职：[drawer-toolbar](../blueprint/note-drawer-markdown-toolbar.md)、[mechanical-gates](../blueprint/note-mechanical-checks.md)、[rename-draftcard](../blueprint/notecard-rename-draft-card.md)；工作便签归属：[own-namespace implemented](../blueprint/history/own-notes-namespace.md)与[own-namespace proposed](../blueprint/history/own-notes-namespace-proposal.md)为生命周期对，成对保留。

配套：[github-maintenance](../desktop/github-maintenance.md)、[markdown-assets](./markdown-preview-local-assets.md)、[file-glyph](./drawer-markdown-file-glyph.md)、[reveal-race](./file-tree-reveal-race.md)、[share-import](../blueprint/share-import.md)、[plugin-forms](./requirements/plugin-architecture-forms.md)、[plugin-debug](./requirements/plugin-import-debug.md)、[entry-nav](./entry-switch-navigation.md)、[f12-nav](./f12-navigation.md)。

渲染与编辑器：[emphasis](./markdown-emphasis-orange-text.md)（强调色去填充块）、[standalone-refresh](./standalone-editor-auto-refresh.md)（独立编辑器外部变更自刷新）。

## Acceptance criteria

以下为 2026-09-26 整理的历史验收，原编号、条文与勾选状态保留给已有 Task。篇数与迁移样例记录不代表当前范围。

- [x] AC-1: 本域 31 篇直接子全部携带有效 parent。
- [ ] AC-2: own-namespace 生命周期对保留两篇，不判重复删除。
- [ ] AC-3: 历史迁移样例已清理（2026-09-27 随鹈鹕骑行 Note 一并移除），不再保留隔离样例。
