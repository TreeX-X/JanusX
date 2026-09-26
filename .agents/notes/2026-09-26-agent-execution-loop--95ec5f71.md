---
schema: harness-note/1
id: 95ec5f71-33e3-4f71-aa05-d3e725c33b10
kind: initiative
lifecycle: accepted
created: 2026-09-26
class: architecture
tags: [agent, harness, parent, governance]
---

# Agent 执行闭环父域

## Goal

Agent 循环、圆桌、turn 守卫、S6 维护面与 S7–S9 主线同属执行闭环却互无父子。本域收拢二十七篇，执行语义只看本域树，不再全文搜索。

## Scope

循环主干：[loop-refactor](./2026-08-08-agent-loop-refactor--33f0f481.md)、[chat-alignment](./2026-09-12-janus-agent-chat-alignment--6813a52b.md)、[roundtable-loop](./2026-09-16-roundtable-chat-harness-loop--f8f6586b.md)、[turn-guard](./2026-09-17-chat-turn-guard-domain-s6--fd109997.md)；切除对[removal-plan](./2026-09-18-legacy-loop-removal--cddc53a5.md)与[removal-执行](./2026-09-18-legacy-loop-removal--b766003d.md)成对保留，前者为后者的 cut-list 依据。

产物与契约：[artifact-bundle](./2026-09-16-roundtable-artifact-bundle-s5--46d65946.md)、[artifact-card](./2026-09-16-roundtable-artifact-card-s5--6471d8f2.md)、[artifact-preview](./2026-09-09-artifact-preview--e74d8e85.md)、[task-contract](./2026-09-18-task-contract-adoption--6b7c688e.md)。

S6 维护面五件套：[discussion](./2026-09-17-maintenance-discussion-unified-s6--cb026d42.md)、[guard](./2026-09-17-maintenance-harness-guard-s6--2b73dd7d.md)、[bridge](./2026-09-17-maintenance-harness-bridge-s6--1f21d390.md)、[apply](./2026-09-17-maintenance-harness-apply-s6--66bf1be8.md)、[shared-render](./2026-09-17-maintenance-panel-shared-render-s6--c0f3f75a.md)。

主线与执行器：[repo-identity-S7](./2026-09-17-harness-repo-identity-s7--0f2f5228.md)、[execution-adapter-S8](./2026-09-18-harness-execution-adapter-s8--553f17a8.md)、[portable-results](./2026-09-18-harness-portable-results--11d8826d.md)、[s9-readiness](./2026-09-18-harness-s9-readiness--28ce4fe4.md)、[undo](./2026-09-18-harness-undo--ee0e8ff1.md)、[xdo-executor](./2026-09-18-desktop-xdo-executor--b057b3f0.md)、[review-repair](./2026-09-18-independent-review-repair--b055c1fe.md)、[handoff-brief](./2026-09-18-handoff-brief--a972542e.md)、[verify-harden](./2026-09-17-verify-pipeline-harden--40cc28a8.md)、[notifications](./2026-06-28-agent-notifications--ff0fe2db.md)。

PI 运行时三篇为反转续接非重复：[context-recognition](./2026-09-11-janus-pi-context-recognition--e34329c5.md)否决 hook 在先，[hook-management](./2026-09-13-janus-pi-hook-management--a8a80c8f.md)声明理由过时并建 hook 在后，均以本域为父。

## Acceptance criteria

- [x] AC-1: 本域 27 篇直接子全部携带有效 parent，执行闭环检索收敛。
- [ ] AC-2: legacy 双件保持计划与执行先后关系，不二合一。
- [ ] AC-3: PI 两篇反转关系保留，不判重复。
