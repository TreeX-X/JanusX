---
{
  "schema": "harness-note/2",
  "id": "c0a75c6a-5d06-4088-b7ed-9ecdd835b3d3",
  "kind": "requirement",
  "lifecycle": "accepted",
  "created": "2026-09-26",
  "class": "architecture",
  "tags": ["memory","knowledge","parent","governance"],
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/c1c04881-a2fb-430f-bc26-528027d0e5cf"
}
---
# 记忆与知识演进专题

## Expected behavior

汇集个人记忆、工程知识隔离和模型提供方的演进需求及阶段决策。当前系统职责与代码入口由 [记忆与知识模块](../module.md)声明；本专题保留 MVP、M1–M4 与后续改造的独立状态，阶段链不表示运行时调用。

## Scope

2026-09-30 规划修订：[统一记忆内核需求](./unified-memory-laya-primary.md)确立以 Qwen-4B 本地部署为基础方案，同时兼容多环节自由编排扩展（支持提取、条目审核、Wiki 生成与复核各环节在本地 Qwen、Jev、外置 LLM 或纯规则间可插拔组合）；规划要求将 Laya/mDeBERTa/Nimble 作为历史评测对照并退出部署；这是目标边界，不是当前安装或运行状态的证明。文档保持 draft，以多环节适配器与新验收标准推进。

[MVP 总纲](./independent-knowledge-assistant.md)为本域直接子并兼 M 链链头：[M1 存储](../user-memory-m1.md)以总纲为父，[M2 召回](../user-recall-m2.md)以 M1 为父，[M3 工具](../user-memory-tools-m3.md)以 M2 为父，[M4 一瞥](../user-memory-surface-m4.md)以 M3 为父。

分离线保留两篇不合并：[分离终态提案](../personal-vs-engineering-memory.md)为本域直接子，[首片可执行内核](../personal-engineering-separation.md)以该提案为父；[persona 前身](./personal-memory-persona.md)为语义输入，以本域为父。

地基层：[queue 管线](../knowledge-pipeline.md)为权威所有者不可动；[OSS survey](../agent-assistant-oss-survey.md)、[chat-landing](./assistant-chat-landing.md)为约束输入；[Laya 校准层](./laya-decision-model-knowledge-confidence.md)归档为历史实验参考。四篇均以本域为父。

## Acceptance criteria

保留 2026-09-26 整理验收及原勾选，不据此升级后续模型需求。

- [x] AC-1: M1–M4 先后链 parent 闭合，总纲可达任意一片。
- [ ] AC-2: 分离提案仍为 proposed，首片仍为 implemented，不混生命周期。
- [ ] AC-3: queue 管线保持地基地位，不被上层扩展替代引用。
