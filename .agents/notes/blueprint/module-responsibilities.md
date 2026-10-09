---
{
  "schema": "harness-note/2",
  "id": "b135f70a-0e7f-47e0-a8c2-968085edc472",
  "kind": "note",
  "lifecycle": "accepted",
  "created": "2026-10-08",
  "updated": "2026-10-08T09:26:04.974Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/f12d99b4-c116-48dc-96d9-e3ac74ae41cd",
  "codeRefs": [
    {"repoId":"972afef3-2fc7-49de-a3ee-7e041225d28c","path":"scripts/verify-note-corpus.mjs","role":"entry"},
    {"repoId":"972afef3-2fc7-49de-a3ee-7e041225d28c","path":"scripts/note-relocations.mjs","role":"implementation"}
  ]
}
---

# 按真实职责细分模块与迁移 Note

## 当前结构

蓝图没有更深节点是目录尚未细分，并非旧 Note 转换或格式不支持。对照现有正文、服务入口和 UI 调用，本轮在 Note 与蓝图、会话与工作区下各增加四个子模块，形成项目、一级职责、子职责三层，共 17 个模块入口。

| 父模块 | 子模块 | 归属依据 |
| --- | --- | --- |
| Note 与蓝图 | [工程文档读取与 wiki](documents/module.md) | 共享读取、来源和引用、工程目录、文档迁移与校验。 |
| Note 与蓝图 | [模块投影与导航](navigation/module.md) | 从来源派生模块页，维护布局、预览、搜索、关注定位及返回。 |
| Note 与蓝图 | [蓝图维护对话](maintenance/module.md) | 对话、读取/编辑工具、提案、文件批准与撤销。 |
| Note 与蓝图 | [工作区组合与初始化](workspaces/module.md) | 明确 checkout 的组合、身份、初始化和接入检测。 |
| 会话与工作区 | [会话记录与续接](../sessions/records/module.md) | 稳定会话、转录适配、回合内容与时间线、续接。 |
| 会话与工作区 | [会话检查点](../sessions/checkpoints/module.md) | 快照服务的桌面接入、会话关联、保留与显式恢复。 |
| 会话与工作区 | [项目对话与任务线程](../sessions/threads/module.md) | 项目/viewRef 绑定和 Task run 的连续上下文。 |
| 会话与工作区 | [工作树隔离与切换](../sessions/worktrees/module.md) | Git worktree 生命周期及活动目录作用范围。 |

父模块保留整体协作说明及跨子模块的接入、综合交付与性能专题，子模块维护独立细节。并不把每个实现切片都提升为模块，也不按文件数量平分目录。现有 Task 和决策均没有被改造成模块：它们记录交付契约或特定取舍，不能替代长期职责入口。

两批共移动 77 份 Note。其中四份旧归属修正到工作台：抽屉 Markdown 工具栏、终端 DraftCard 命名、共享关闭热区和 ModalFrame 动效。分类以正文中的服务职责为据，因此不把文件名里的 worktree 当作归属依据。其他一级模块本轮保留；知识领域仍有用户正在编辑的三个原始文件。

## 迁移与证据边界

[归属映射](../../../docs/migrations/note-responsibilities.json)覆盖迁移前 261 份文档，记录基线 5095c4d73769235b0ca04d4bf407c0a11c0e7e24、原始 SHA-256、旧路径、目标路径、稳定 URI、归属与保留理由。它是历史迁移证据，运行时不读取，也不代替模块声明。

原 UUID、created、生命周期、AC 编号和历史契约保持不变。迁移刷新维护时间、直接所属 module、相对链接及活跃代码反向引用；父模块说明、接入排期及检查器设计同步当前事实。原 Task 的执行回执、来源哈希和基线提交不重签。目录移动使旧绝对路径失效，旧证据应按所记 Git 修订读取；当前调用方使用新路径或稳定 URI。

原始 v2 迁移报告保持原字节。检查器沿明确的迁移链验证当前文件身份及创建日期，不能因路径移动放宽完整性检查。三个受保护旧链接只在原源哈希匹配、历史映射存在且当前目标身份正确时保留诊断；缺失、换身份及任意新断链仍失败。全部八份原始用户文件保持原字节。

## 验证

`node scripts/verify-note-corpus.mjs`：267 份维护文档、254 份历史迁移来源、3 份保护文件，零错误；23 条读取诊断仍为明确的外仓未绑定或保护旧链接。

针对 `note-relocations`、`note-corpus-navigation`、`agent-notes-check`、`workflowx-v2`、`blueprint-architecture` 五个单测文件，共 31 个不同用例通过。迁移回归覆盖合法链、目标缺失、身份/日期变化、保护源被修改、没有映射、环、路径越界和大小写碰撞；真实语料遍历全部 270 份文档，核对直接归属、按类型分组及 wiki 深度。

`npx playwright test tests/e2e/blueprint-note-corpus.spec.ts --project=island --workers=1`：2 个真实语料场景通过，分别覆盖内嵌画布与工作台。读取实际仓库，使用共享解析、索引、按需原文读取与生产投影；Electron 传输由测试桥替代。验证项目→Note 与蓝图→模块投影与导航、当前父节点保留、直属文件、真实正文与两层返回，不写入文档或画布布局。截图随 Playwright 本地产物保存。这不是独立评审或完整 Electron 进程验收。

`npm run typecheck:strict-unused` 通过。迁移前后逐份核对 261 个原身份、创建日期、AC、历史元数据及证据，八份原始用户文件哈希一致；65 个改动 TypeScript/TSX 源文件去注释后的语法输出一致，另两处 CSS 仅修正文档注释。原始迁移报告与接入验证报告保持原字节。当前源码、Notes 和两个可用外仓的 Notes/docs 未发现迁移旧路径的活跃调用残留。

第一次并行测试竞争了真实仓库的缓存锁，新增语料测试现直接调用只读索引和投影，不碰共享缓存或租约；回归夹具也明确区分受保护 v1 归属与 v2 的 module。修正后针对性重跑通过。最终独立评审仍由跨仓接入 Task 跟踪；本次没有重新签发历史 Task 验收。
