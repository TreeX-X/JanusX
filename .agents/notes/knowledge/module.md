---
{
  "schema": "harness-note/2",
  "id": "c1c04881-a2fb-430f-bc26-528027d0e5cf",
  "kind": "module",
  "lifecycle": "accepted",
  "created": "2026-10-03",
  "class": "architecture",
  "tags": [
    "memory",
    "knowledge"
  ],
  "parent": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/b2e7f160-2d77-4cc4-8828-b9cf3e5d931a",
  "codeRefs": [
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/main/knowledge/memory-domain-controls.ts",
      "symbol": "installMemoryDomainControls",
      "role": "entry"
    },
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/main/knowledge/processing-queue.ts",
      "symbol": "KnowledgeProcessingQueue",
      "role": "entry"
    },
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/main/knowledge/knowledge-local-settings.ts",
      "symbol": "configureKnowledgeLocalModel",
      "role": "entry"
    },
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/main/knowledge/knowledge-local-resources.ts",
      "symbol": "KnowledgeLocalResourceInstaller",
      "role": "entry"
    },
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/main/knowledge/retire-engineering-assets.ts",
      "role": "implementation"
    }
  ],
  "relations": [
    {
      "type": "related-to",
      "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/8688b5ab-1f7f-5ff9-ba1b-ef75b7fd5917"
    },
    {
      "type": "related-to",
      "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/844bc2f1-3be4-4b47-83ca-0ef792bc5c1d"
    }
  ],
  "updated": "2026-10-11T16:34:07Z",
  "moduleState": "partial"
}
---

# 个人记忆与共享来源

## Responsibility

维护个人记忆的采集、可靠写入、候选确认、纠正、遗忘、来源审计、画像和对话召回。工程知识以[原始 Note 与蓝图](../blueprint/module.md)为准；旧工程知识提取、Wiki 生成/历史、图谱、检索和独立知识 MCP 已退出。

## Design

PersonalMemoryWorkbench 保留个人卡片、资料编辑、搜索、来源和审核；右侧助手只消费个人候选。persona 与个人子设置控制采集、处理和召回，关闭功能保留已有个人数据。人工确认不受蓝图模型或工程开关控制；具体策略见[分域控制](memory-domain-controls.md)。工作台扩展和全终端自动 Hook 接入仍按[个人方向](personal-memory-workspace.md)后置。

KnowledgeProcessingQueue、观察存储、候选事实锁、审计、撤销与恢复服务继续服务个人记忆。确定性处理不再从项目事件生成工程事实，工程 recall 端口返回空结果，Chat 已移除旧项目记忆访问计数；个人 BM25 召回仍在内存使用。显式个人保存、替代、纠正和遗忘沿用现有来源与版本检查。

共享终端 Hook 的状态处理继续运行。只有个人画像开启且既有 inferEngineeringHabits 选项允许时，工程对话的可归因用户消息进入习惯证据；CaptureInbox 在持久化与重放前筛选，助手正文、工具结果和状态摘要不再作为新工程知识积累。个人会话的已有近期记录策略保持，其扩展讨论不混入本次退出。

retireEngineeringAssets 在创建窗口前清理明确由旧工程业务生成的 Wiki、graph、旧索引、automation-tasks 和提取中间文件；混合事实按 scope/provenance 保留 user 与不明记录。路径限制在知识存储根内，不跟随链接；原始观察、审计、个人 profile、blobs、模型下载和配置保留。该迁移幂等，失败保留来源并在以后启动重试，不删除整个 knowledge 根。

模型/JEV 请求与凭据基础迁至 llm/model-json 和 llm/jev-credentials，保留原加密文件名。个人及 Hook 仍需的本地实现继续存在，部署入口隐藏；蓝图审核与 MCP 配置由蓝图设置负责，不沿用工程自动生成服务。

## Validation

个人记忆、来源撤销、旧资产迁移、Hook、Chat ports 与蓝图建议的组合回归通过。实际数量、命令范围、真实模型结果及未验收项统一见[实施基线](../blueprint/implementation-baseline.md)。迁移测试使用隔离数据，未手工清理真实用户存储。

## Related documents

[个人工作台](personal-memory-workspace.md)维护后续产品边界；[个人与工程分离](personal-engineering-separation.md)保留隔离依据；[记忆演进研究](requirements/memory-knowledge.md)、[统一内核研究](requirements/unified-memory-laya-primary.md)与[旧方案资料](history/reconstruction-index.md)保留历史要求和实验，不再描述当前工程生成管线。

[Chat 联动备忘录与线性里程碑](user-todo-janus.md)记录对话自动整理、人工编辑、右侧悬浮备忘录和工作区映射的产品想法；备忘录文件存于 Janus、经映射关联工作区，janus-chat 靠备忘录状态开关读写，打开哪份就维护哪份，整理由自然语言触发；一份文件一条里程碑线，节点内含多个自然语言的点、不设完成状态，文件经列表 tab 增删选中与折叠。该想法尚未实施，独立交付还是并入后续个人建设仍待评估。

## Acceptance criteria

- [x] AC-1: 队列与个人召回职责可定位到当前代码，工程专用生成和检索入口已退出。
- [x] AC-2: 当前能力、后置个人建设与未验收项分别说明，不以旧模型实验替代新审核验收。
