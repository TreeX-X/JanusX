---
{
  "schema": "harness-note/2",
  "id": "5d28b582-d905-4aa6-bfc8-8aa33ac17cdd",
  "kind": "idea",
  "lifecycle": "proposed",
  "created": "2026-10-09",
  "updated": "2026-10-10T06:13:02.987Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/17bbe20e-f05c-470c-aee1-3f92a86369ab",
  "relations": [
    {"type": "related-to", "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/03af9456-cef5-4730-80ff-e7e1d239d2a7"}
  ]
}
---

# Note 状态在蓝图中的显示

## Intent

节点灯只表示当前待处理审核意见；类型标签和状态文字表达 Note 本身。blueprint-note-status 按 harness-note/2 原字段生成状态，卡片、筛选、图例和小地图共用语义，不从模型分数推导实施状态。

## 当前映射

| 类型 | 状态依据 |
| --- | --- |
| module | moduleState planned/partial/implemented/retired；rejected/archived 优先保留非活动生命周期。 |
| decision | accepted 显示已采纳，implemented 显示已实施；采纳不表示正在执行。 |
| requirement | lifecycle 与有效验收覆盖数量分别显示，accepted 不等于交付。 |
| task | execution.state；done 只有共享 noteEvidence 的有效结果才能显示已完成，否则显示待验证；缺记录显示无执行记录。 |
| note / idea | 原生命周期，未知值如实显示未知；不回落为规划或执行中。 |

建议有未处理项才点灯，部分处理保持、全部清理隐藏；目标删除、版本变化和迟到结果防复活由[建议模块](../maintenance/suggestions/module.md)负责。自动审核阶段与错误在工具栏活动区静默显示，不复用节点灯，不通知或发声。读取建议、生成或关闭意见均不改变 Note 状态。

## 验证

tests/unit/blueprint-note-status.test.ts 检查生命周期、模块状态、任务结果、覆盖数量及非活动优先级；blueprint-review-ui.test.ts 验证建议展示、定位、逐项处理和即时设置。桌面与发布验证按[实施基线](../implementation-baseline.md)记录。Task 仅调整显示，不加入首版语义审核类型。
