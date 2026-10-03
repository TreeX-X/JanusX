---
schema: harness-note/1
id: c0a75c6a-5d06-4088-b7ed-9ecdd835b3d3
kind: initiative
lifecycle: accepted
created: 2026-09-26
class: architecture
tags:
  - memory
  - knowledge
  - parent
  - governance
parent: note://972afef3-2fc7-49de-a3ee-7e041225d28c/c1c04881-a2fb-430f-bc26-528027d0e5cf
---
# 记忆与知识演进专题

## Goal

汇集个人记忆、工程知识隔离和模型提供方的演进需求及阶段决策。当前系统职责与代码入口由 [记忆与知识模块](./2026-10-03-module-memory--c1c04881.md)声明；本专题保留 MVP、M1–M4 与后续改造的独立状态，阶段链不表示运行时调用。

## Scope

2026-09-30 规划修订：[统一记忆内核需求](./2026-09-28-unified-memory-laya-primary--736081fc.md)确立以 Qwen-4B 本地部署为基础方案，同时兼容多环节自由编排扩展（支持提取、条目审核、Wiki 生成与复核各环节在本地 Qwen、Jev、外置 LLM 或纯规则间可插拔组合）；规划要求将 Laya/mDeBERTa/Nimble 作为历史评测对照并退出部署；这是目标边界，不是当前安装或运行状态的证明。文档保持 draft，以多环节适配器与新验收标准推进。

[MVP 总纲](./2026-09-14-independent-knowledge-assistant--6e34d77d.md)为本域直接子并兼 M 链链头：[M1 存储](./2026-09-15-user-memory-m1--fd02d3bc.md)以总纲为父，[M2 召回](./2026-09-15-user-recall-m2--dec987d8.md)以 M1 为父，[M3 工具](./2026-09-15-user-memory-tools-m3--939f0bcf.md)以 M2 为父，[M4 一瞥](./2026-09-15-user-memory-surface-m4--b32f92b5.md)以 M3 为父。

分离线保留两篇不合并：[分离终态提案](./2026-09-15-personal-vs-engineering-memory--4515fa0e.md)为本域直接子，[首片可执行内核](./2026-09-18-personal-engineering-separation--296ddf52.md)以该提案为父；[persona 前身](./2026-09-10-personal-memory-persona--f2b9e5d6.md)为语义输入，以本域为父。

地基层：[queue 管线](./2026-09-03-knowledge-pipeline--dcc5e8a0.md)为权威所有者不可动；[OSS survey](./2026-09-14-agent-assistant-oss-survey--82db94eb.md)、[chat-landing](./2026-09-14-assistant-chat-landing--10bb564c.md)为约束输入；[Laya 校准层](./2026-09-22-laya-decision-model-knowledge-confidence--673865a1.md)归档为历史实验参考。四篇均以本域为父。

## Acceptance criteria

保留 2026-09-26 整理验收及原勾选，不据此升级后续模型需求。

- [x] AC-1: M1–M4 先后链 parent 闭合，总纲可达任意一片。
- [ ] AC-2: 分离提案仍为 proposed，首片仍为 implemented，不混生命周期。
- [ ] AC-3: queue 管线保持地基地位，不被上层扩展替代引用。
