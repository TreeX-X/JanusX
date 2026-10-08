---
{
  "schema": "harness-note/2",
  "id": "bc9c2ca8-e036-48ec-a35e-667d694460ca",
  "kind": "module",
  "lifecycle": "accepted",
  "created": "2026-10-08",
  "updated": "2026-10-08T09:06:56.496Z",
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

按明确 checkout 绑定组合蓝图，提供每工作区的接入状态、空态和初始化预览。规划声明与开发证据各保留自己的仓库身份。

## Design

composeBlueprint 在读取后装配接口及证据，缺失、冲突或未绑定来源保留诊断。WorkspaceBlueprintService 调用 agentX 的初始化和撤销能力，打开工作区不自动生成文件；只读接入检测不替代数据初始化。架构师工作区与组合设计的历史方案分别保留，不能把提案视为已交付功能。
