---
schema: harness-note/1
id: a361448b-58fe-4bb7-826f-540d250d224a
kind: requirement
lifecycle: draft
created: 2026-09-19
class: architecture
---

# Agent Note: Worktree隔离支撑三Agent并行

## Problem

JanusX的工作区是单盘模型。`Workspace{id,name,path}`绑定一个本地工程路径，多终端共享同一`cwd`，检查点按`cwd`记录、事后回滚。一次开三个Agent时三方同写一份文件，冲突只能靠人工记忆与还原点挽回，全自主权限不敢开，比稿式并行跑不起来。Orca证明并行必须事先隔离，而非事后修复。

## Proposal

引入worktree作为任务隔离单元，工作区退为工程注册。`Workspace`保持现有`id/name/path`注册与布局能力，不做迁移；新增`Worktree{id,projectId,path,branch,startFrom,status,comment}`，`id`采用`repoId::path`，创建走`git worktree add -b 新分支 startFrom`，`startFrom`首版只支持`origin/main`与本地分支。创建后台执行，侧栏按`project→worktrees`分组展示进度，支持取消与失败重试。

每个worktree锁定自有目录、分支、终端与检查点作用域，检查点查询键从工作区`path`切换为worktree `path`，恢复弹窗的冲突上抛与恢复前预快照原样保留。新盘依赖缺口用最小共享补齐：大而可重建目录走软链接，`.env`类本地密钥走按字面路径拷贝，不做通配。删除默认删盘删分支，分支含未合并提交被git拦下时只删盘、分支进入待复核列表。首版只做本地单仓库，不做SSH远端、多仓库分组、daemon保活与休眠看板。

三Agent执行时表现为一次创建三个worktree，各自独立分支与终端，侧栏以状态灯聚合，逐个走差异评审，保留优胜者提交合并，其余删盘。

## Alternatives considered

- 工作区级还原点加固 — 最强理由是零架构改动，复用现有`cwd`键检查点与恢复弹窗，单人单任务体验最好。不可行的驱动是它只解决事后回滚，不解决事前互踩，三个Agent同盘仍需串行避让。
- 直接上Orca全集含SSH与daemon保活 — 最强理由是一步到位，远端算力与退出不断跑全有。不可行的驱动是改动面覆盖终端保活、远端relay allowlist、apping内存模型，首版风险与维护成本超出并行收益。
- Do nothing / reuse — 保持单盘多终端现状，不新增分支与目录管理。代价是并行规模锁死在人工协调上限，Agent自主度无法提升，评审无稳定锚点。

## Acceptance criteria

- [ ] 同一工程可创建三个worktree并同时运行Agent，文件互不可见，分支互相独立。
- [ ] 侧栏按工程分组显示worktree状态与进度，创建失败可重试，删除遵循删盘删分支与未合并分支复核规则。
- [ ] 检查点按worktree路径隔离列出，恢复前自动预快照，冲突上抛到界面层。
- [ ] 新worktree缺失的依赖与本地密钥可通过共享或拷贝恢复，无需全量重装即可启动。
- [ ] 无worktree时旧工作区行为不变，单盘路径仍可正常创建与恢复检查点。

## Risks

- 盘与分支膨胀导致磁盘与分支列表失控，缓解是资源清理入口与休眠过滤随首版同发。
- 用户在主盘与任务盘之间改错位置，缓解是侧栏分组、当前盘分支显式展示与跳转命令。
- Windows路径大小写与同义路径导致`repoId::path`冲突误判，缓解是路径归一化收敛到单一解析器。
- 共享目录软链接把本应隔离的状态泄漏到各盘，缓解是共享范围只限可重建目录与明确声明的本地密钥。
