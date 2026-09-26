---
schema: harness-note/1
id: c0a75c6a-5d06-4088-b7ed-9ecdd835b3d3
kind: initiative
lifecycle: accepted
created: 2026-09-26
class: architecture
tags: [memory, knowledge, parent, governance]
---

# 记忆知识父域

## Goal

个人记忆与工程知识长期平铺十二篇，M1–M4 链式关系只存在于正文相对链接。本域确立显式父子：MVP 总纲为父，M1–M4 为先后链，分离提案与首片落地各就其位。

## Scope

[MVP 总纲](./2026-09-14-independent-knowledge-assistant--6e34d77d.md)为本域直接子并兼 M 链链头：[M1 存储](./2026-09-15-user-memory-m1--fd02d3bc.md)以总纲为父，[M2 召回](./2026-09-15-user-recall-m2--dec987d8.md)以 M1 为父，[M3 工具](./2026-09-15-user-memory-tools-m3--939f0bcf.md)以 M2 为父，[M4 一瞥](./2026-09-15-user-memory-surface-m4--b32f92b5.md)以 M3 为父。

分离线保留两篇不合并：[分离终态提案](./2026-09-15-personal-vs-engineering-memory--4515fa0e.md)为本域直接子，[首片可执行内核](./2026-09-18-personal-engineering-separation--296ddf52.md)以该提案为父；[persona 前身](./2026-09-10-personal-memory-persona--f2b9e5d6.md)为语义输入，以本域为父。

地基层：[queue 管线](./2026-09-03-knowledge-pipeline--dcc5e8a0.md)为权威所有者不可动；[OSS survey](./2026-09-14-agent-assistant-oss-survey--82db94eb.md)、[chat-landing](./2026-09-14-assistant-chat-landing--10bb564c.md)为约束输入；[Laya 校准层](./2026-09-22-laya-decision-model-knowledge-confidence--673865a1.md)为其后 annotate-only 扩展。四篇均以本域为父。

## Acceptance criteria

- [x] AC-1: M1–M4 先后链 parent 闭合，总纲可达任意一片。
- [ ] AC-2: 分离提案仍为 proposed，首片仍为 implemented，不混生命周期。
- [ ] AC-3: queue 管线保持地基地位，不被上层扩展替代引用。
