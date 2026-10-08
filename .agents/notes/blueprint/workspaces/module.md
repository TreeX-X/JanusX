---
{
  "schema": "harness-note/2",
  "id": "bc9c2ca8-e036-48ec-a35e-667d694460ca",
  "kind": "module",
  "lifecycle": "accepted",
  "created": "2026-10-08",
  "updated": "2026-10-08T11:56:27Z",
  "parent": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/f12d99b4-c116-48dc-96d9-e3ac74ae41cd",
  "moduleState": "partial",
  "codeRefs": [
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/main/blueprint/blueprint-composition.ts",
      "role": "entry"
    },
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/main/harness/workspace-blueprint.ts",
      "role": "implementation"
    },
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/main/ipc/workflowx-handlers.ts",
      "role": "implementation"
    }
  ]
}
---

# 工作区组合与初始化

## Responsibility

负责跨模块管理 Note 的工作区识别与蓝图组合，提供每工作区的接入状态、空态和初始化预览。支持同仓模块结构，跨仓时按明确 checkout 绑定组装；规划声明与开发证据各保留自己的身份。

## Design

composeBlueprint 在读取后装配接口及证据，缺失、冲突或未绑定来源保留诊断。WorkspaceBlueprintService 调用 agentX 的初始化和撤销能力，打开工作区不自动生成文件；只读接入检测不替代数据初始化。

架构师功能以跨模块 Note 管理为核心。蓝图需要区分文档主要归属与跨模块关联，支持无代码的规划工作区，并在模块浏览和关注定位时保留共同需求、决策与协作关系的来源。现有模块解析和跨仓组合可复用，完整识别与解析仍待适配和验收，详见[架构师工作区契约](architect-workspace-model.md)。
