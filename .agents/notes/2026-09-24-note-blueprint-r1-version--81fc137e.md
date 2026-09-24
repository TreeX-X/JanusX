---
schema: harness-note/1
id: 81fc137e-9c56-4d3a-88e4-10f175852c97
kind: task
lifecycle: accepted
created: 2026-09-24
class: architecture
tags: [note, blueprint, version, r1]
relations:
  - type: implements
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/e7c03317-8bb8-4d1d-a1b2-832be6c5a3c5
    criteria: [AC-1]
  - type: governed-by
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/41e93b25-92ce-4547-9250-e28cf4b1907f
work:
  scope:
    - repoId: d2499d5b-4ceb-4d46-aa3b-18e5c9b86034
      paths: [standards/harness-note/1/, scripts/, .codex/, .claude/, .agents/, AGENTS.md, CLAUDE.md]
    - repoId: 62b44166-82f0-41ff-838d-e2b02388ed06
      paths: [packages/harness-core/, packages/harness-node/, packages/notes-cli/, .agents/, .codex/, .claude/, AGENTS.md, CLAUDE.md]
    - repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
      paths: [.agents/, .codex/, .claude/, AGENTS.md, CLAUDE.md, tests/unit/, package-lock.json]
  acceptanceRefs:
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/e7c03317-8bb8-4d1d-a1b2-832be6c5a3c5
      criterionId: AC-1
  verification:
    - id: V-1
      kind: command
      required: true
      repoId: d2499d5b-4ceb-4d46-aa3b-18e5c9b86034
      cwd: .
      program: node
      args: [scripts/verify-harness-standard.mjs]
    - id: V-2
      kind: command
      required: true
      repoId: 62b44166-82f0-41ff-838d-e2b02388ed06
      cwd: .
      program: npm
      args: [run, test, -w, '@janus-agent/harness-core']
---

# R1 — 正式版本与受管配置贯通

## Scope

依据[实施计划](./proposed/architecture/2026-09-23-blueprint-notev2-implementation-plan.md)完成 S1.2 联动接入。复用 WorkFlowX 已裁决的最小 initiative interfaces 字段，先使 agentX 的解析、校验、往返和标准样例通过，再封存最终 manifest 并对齐三仓 profile/digest 和受管配置。用户已授权本轮连续实施。源 schema 的候选字段语义不扩张，taskContractHash 的既有输入保持原定义。

JanusX 的 AGENTS/CLAUDE、Codex/Claude skills/agents/commands 使用 WorkFlowX 的受管同步机制更新，保留各仓本地块。发布矩阵仅以真实提交与检查记录闭环；远程发布不属于本段。保留三仓无关未提交文件。

## Acceptance criteria

- [ ] AC-1: WorkFlowX 的 S1.2 正反接口样例在 harness-core、notes-cli 与 JanusX 的消费路径一致通过，非法字段不被接受，修改接口声明不改变既有任务契约哈希。
- [ ] AC-2: 三仓 profile/version/digest 与最终 LF-normalized manifest 一致；managed sync/check 包含 JanusX，保留本地配置且重复执行不产生变化。
- [ ] AC-3: 原有两个候选/运行时不兼容失败已解决；构建和相关回归通过，独立 evaluatorX review 通过后再启动 R2。

## Verification

运行 WorkFlowX 标准验证与三仓受管配置检查；运行 agentX harness-core、harness-node、notes-cli 构建和相关 suites；JanusX 验证实际安装的共享包版本、profile 以及新接口样例。代码自查和独立 review 分开记录；失败不得以跳过样例、降低断言或删除旧测试消除。
