---
{
  "schema": "harness-note/2",
  "id": "5a9a367e-5546-409b-a0a0-fb6950b64632",
  "kind": "task",
  "lifecycle": "accepted",
  "created": "2026-10-03",
  "class": "architecture",
  "work": {
    "scope": [
      {"repoId":"972afef3-2fc7-49de-a3ee-7e041225d28c","paths":[".agents/notes/","scripts/","tests/unit/","src/"]}
    ],
    "acceptanceRefs": [
      {"uri":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/ac49c3a6-0ce3-47bc-b8ee-a05c7db35e83","criterionId":"AC-1"},
      {"uri":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/ac49c3a6-0ce3-47bc-b8ee-a05c7db35e83","criterionId":"AC-2"},
      {"uri":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/ac49c3a6-0ce3-47bc-b8ee-a05c7db35e83","criterionId":"AC-3"},
      {"uri":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/ac49c3a6-0ce3-47bc-b8ee-a05c7db35e83","criterionId":"AC-4"},
      {"uri":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/ac49c3a6-0ce3-47bc-b8ee-a05c7db35e83","criterionId":"AC-5"}
    ],
    "verification": [
      {
        "id": "V-1",
        "kind": "command",
        "required": true,
        "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
        "cwd": ".",
        "program": "npm",
        "args": ["run","check:notes"]
      },
      {
        "id": "V-2",
        "kind": "command",
        "required": true,
        "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
        "cwd": ".",
        "program": "npx",
        "args": [
          "vitest",
          "run",
          "tests/unit/blueprint-architecture.test.ts",
          "tests/unit/harness-execution-adapter.test.ts"
        ]
      }
    ],
    "review": "independent"
  },
  "updated": "2026-10-08T09:06:56.496Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/bd612cd8-0676-4c46-98ba-81d1dc008505"
}
---

# 全量整理模块文档与历史 Note 的关联

## Scope

执行 [全仓整理需求](../requirements/note-corpus-reorganization.md)。已有 [模块投影决策](../../navigation/document-driven-module-view.md)约束身份、显式关系和 Task 独立性。当前八个旧父域中部分已是模块，部分仍是交付专题；逐篇读正文后整理，不能靠批量文件名匹配建立正式归属。产品面与远程域可在验证实际入口和边界后成为当前模块；记忆规划、蓝图交付与性能专题可挂接已有模块。保留未知字段及历史嵌入来源，不删除生命周期不同但主题相近的文档。

针对 DSH 混合文档，保留现有决策 UUID，核对实际代码后整理已实现取舍、成本和限制；未完成行为放入独立需求并明确链接。使用日期、slug 与 UUID 短前缀命名并更新所有实际引用。源码改动只限反向注释，不改变运行行为。

本轮开始时未提交的 3944b368 知识复审需求只读保留；其他并发新增文件同样不改动或纳入提交。原有全部 Task 保持字节与契约不变。基线清单存于本地 artifacts/module-structure/reorganization-before.json，仅供校验，不提交为持久索引。coder 提供逐篇审阅清单、调整理由和验证脚本/结果，Main 负责最终决策 Note 与收尾。

## Acceptance criteria

- [x] AC-1: 需求 AC-1 至 AC-5 均以可执行检查或明确的人工审阅证据验收，未解决项如实报告。

## Verification

运行 V-1、V-2，额外核对基线身份、Task 字节与哈希、未提交文件、移动路径引用及源码仅注释变化。用现有 loadNoteEntries、projectGraph、projectArchitecture 读取真实仓库，校验当前结构及历史关联，不通过修改消费者来掩盖文档缺陷。将审阅清单和临时脚本保存在 artifacts，不引入第二份提交的文档目录。

## Results

2026-10-03: 实施与独立验收通过。当前文档组织为一个项目、八个模块、三个交付或演进专题。原有 231 个 Note 身份全部保留，其中 215 篇字节不变、16 篇调整；新增本次需求、Task 和 DSH 后续需求。DSH 与 Planche 改名均保留 UUID，DSH 的已落地边界与未完成信号分别记录，Planche 保持 draft。固定 Git 提交、路径与 blob 摘要保存原始出处，既有来源 extensions 不改动。

全量 check:notes 检查 234 篇 Note，零错误；27 条外仓链接提示反映既有外仓来源，不表示本仓解析失败。最终源码重新构建的真实读取和投影产生九个结构节点、八条父边与一条显式接口边，零结构诊断；222 篇决策、需求和 Task 均可从模块相关工作访问。全量本仓 URI、唯一身份、代码入口、历史父关系、改名引用和 Git 来源摘要检查通过。可由祖先链推导的关联不重复维护，声明不依赖未提交用户需求。

两个指定单元测试文件共 17 项通过，覆盖结构投影与 Task baseline、receipt、stale contract。14 篇既有 Task 的文件字节和 contractHash、45 项本仓验收 criterionHash 均保持。九篇 initiative 的 Goal/Scope 整理影响 26 处验收引用的输入摘要，这是正常的来源变化；历史 baseline 和 receipt 不重写，不宣称这些输入仍然 fresh。

四个源码文件仅更新五处反向注释，去除注释后的 TypeScript 输出完全一致。未提交的 3944b368 知识复审需求与缓存保留原状。审阅范围为逐项职责、主要取舍、交付范围及关联核对，不声称对所有未修改历史正文做全文编辑审校。临时逐篇清单与机器证据保存在本地 artifacts/module-structure，不作为提交的第二份文档索引。

## Progress

Historical delivery statements remain in this document; no v2 execution receipt is asserted.

## Evidence

Original source: Git e433bb8627150126b782a301352da05e2149c18b:.agents/notes/2026-10-03-note-corpus-reorganization-task--5a9a367e.md. See docs/migrations/note-v2.json for the raw-source hash and historical execution.

## Handoff

Main Agent owns this Task. Reassess scope, fixed acceptance sources and verification before any new run. Preserve independent-review obligations; subagents read only.
