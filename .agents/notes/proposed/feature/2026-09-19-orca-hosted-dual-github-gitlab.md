---
schema: harness-note/1
id: 672b902d-39ba-479b-9cc5-91c0d7cc55db
kind: requirement
lifecycle: draft
created: 2026-09-19
class: feature
---

# Agent Note: Orca hosted双适配 GitHub/GitLab 中国端方案

## Problem

JanusX的Git能力停留在本地操作。`src/shared/ipc/git.ts`与`src/main/ipc/git-handlers.ts`只覆盖`status/log/stage/commit/push/pull`，没有托管平台概念：没有Issue/PR/MR浏览，没有worktree与任务的绑定关系，没有Checks/Pipeline状态回流，没有评论与合并动作。Agent只能看到工作区文件，看不到任务为什么存在。

Orca证明了托管平台结合是ADE的核心回路，而不只是快捷链接。它的任务抽屉从GitHub Issue/PR卡片直接创建worktree，worktree元数据携带`linkedIssue/linkedPR/pushTarget/branch`，提交与PR生成模板复用该绑定，`Actions`失败通过`Fix broken checks`回灌Agent，侧栏持续显示`open/merged/closed/draft`与检查状态。这条回路缺失时，并行Agent越多，任务归属越混乱。

中国端若只接GitHub，覆盖不了内网自建GitLab为主的团队；若只接GitLab，又丢掉开源协同与公开仓库链路。两种平台必须在同一worktree流程下可用，否则会出现两套创建、两套绑定、两套Review面。

## Proposal

采用Orca已验证的方向：统一worktree流程之上做可插拔的托管平台适配，GitHub能力最深，GitLab复用同一流程，能力差异通过显式开关降级。

建立`HostedProvider`抽象，归属主进程，渲染层只调用该抽象。抽象覆盖任务、评审、检查三类操作：列出与读取Issue/MR/PR、解析任务起点为`headSha/base/branch/pushTarget`、列出检查并在需要时拉取失败日志。每个实现声明自身能力：是否支持自动合并、合并队列、堆叠PR、Reaction、流水线子任务。GitHub实现提供`Actions/Projects/自动合并/合并队列/堆叠PR/八种Reaction`全集；GitLab实现提供实例地址可配、自建实例PAT鉴权、`MR Draft/WIP`语义、`Mark ready`、流水线桥接任务与子任务日志、`Unlink/Link MR`。

Worktree元数据扩展`provider/linkedIssue/linkedReview/pushTarget`四个字段。任务抽屉合并显示GitHub与GitLab任务，支持`Has Workspace`过滤与分页加载；创建worktree统一进入交互式composer，预填任务名并写入绑定；提交与PR模板支持`{linkedIssue}`变量；Checks面板统一显示GitHub checks与GitLab pipelines，失败入口统一为把失败名与链接交给Agent。每个仓库记住上次使用的任务源。

分三步落地。先加抽象与元数据字段，不接任何远端，保持本地行为不变。再接通`GitHub.com + 单个GitLab自建实例`的浏览、创建绑定、状态与评论闭环。最后补多实例、Gitea/Gitee槽位、凭据按host存储与环境变量覆盖。

## Alternatives considered

- 只接GitHub — 最强理由是实现最快，直接复用`gh`与公开文档，Actions生态最完整。不可行的驱动是中国内网团队大量使用自建GitLab，单GitHub会导致核心用户无法建任务闭环，且`github.com`网络不稳定会放大`gh auth`与限流故障。
- 只接GitLab自建 — 最强理由是贴近付费主体，实例地址与PAT模式一次性解决合规与内网问题。不可行的驱动是丢掉开源仓库、公开Issue/PR、GitHub Projects三条链路，JanusX作为开源桌面台会失去与上游协同的入口。
- Do nothing / reuse — 保持现有本地Git能力不变，零成本零回归。代价是Agent继续在无任务上下文下工作，多worktree并行时归属靠人工记忆，Review状态与检查失败仍需切浏览器，与Orca已验证的回路差距持续扩大。

## Acceptance criteria

- [ ] `HostedProvider`抽象存在，渲染层无任何直调GitHub/GitLab API的代码，能力差异通过`caps`开关表达。
- [ ] 同一composer可从GitHub Issue/PR与GitLab Issue/MR创建worktree，并正确写入`provider/linkedIssue/linkedReview/pushTarget`。
- [ ] GitHub侧跑通检查、评论、自动合并可见性规则；GitLab侧跑通自建实例地址配置、MR `Mark ready/Close`、流水线日志查看。
- [ ] 不支持的能力在UI隐藏而非报错，例如GitLab下不出现堆叠PR与自动合并入口。
- [ ] 无远端凭据时本地Git全量可用，远端失败只影响对应面板，不阻塞提交与推送。

## Risks

- 双平台API漂移带来双倍维护成本，GitHub GraphQL与GitLab v4字段变更互相独立，缓解是把解析收敛到`resolveStartPoint`与列表映射两个窄口。
- 国内访问`github.com`的网络抖动被误判为鉴权失效，缓解是直调API可配代理、错误区分限流、鉴权、网络三类并给出修复入口。
- 自建GitLab版本碎片导致流水线与Reaction行为不一致，缓解是能力探测失败时按最小交集降级，不做版本强绑定。
- 凭据按host存储引入泄露面，缓解是沿用系统钥匙串、环境变量优先于落盘凭据、默认关闭遥测。
