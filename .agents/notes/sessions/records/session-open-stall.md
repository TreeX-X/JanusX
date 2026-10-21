---
{
  "schema": "harness-note/2",
  "id": "791bf3a5-3e3e-4d57-ae3c-83cd278798e8",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-10-11",
  "updated": "2026-10-21T15:37:53.642Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/0cb931e1-e33c-4e38-a9d9-9d652796d935"
}
---

# 会话侧栏渐进呈现

## Problem

侧栏打开时，外部转录扫描与首次列表读取争用主进程；大量卡片同时挂载也阻塞渲染。结果是点击后短暂停顿，再整批显示。

## Decision

外部扫描中的会话变更合并为一次持久化和一次通知。侧栏先读取已有列表，在可见面板打开后延迟触发扫描；非活动面板不订阅会话事件。列表首屏只挂载 20 张卡片，用户向下滚动、距离列表底部不足 120 像素时再追加 20 张，直至匹配结果耗尽；不再通过定时器自动挂满列表。同批滚动事件共享当前页边界，避免一次滚动连续追加多页。

Git／会话来回切换时，同一筛选条件复用最近 5 秒内成功读取的摘要；过期后的激活请求共享进行中的列表读取，同范围刷新静默保留旧卡片。面板停留 5 秒后补查一次，避免隐藏期间漏掉的事件使缓存一直不更新；离开面板取消补查，事件刷新不受缓存时间限制。错误后重试，切换目录或筛选条件重新读取。IPC 返回的摘要逐字段浅比较，复用未变化的行及列表引用，使 memo 卡片不因克隆对象而重绘。

扫描调度器随打开的面板保留，检查活动状态后才扫描；切换标签或会话范围不重置扫描周期。首次调度在挂载后 120ms，若当时不可见则跳过，下一次活动扫描等待原有 5 秒周期。隐藏不启动新扫描，已发出的请求自然完成；关闭面板释放调度器。

搜索仍匹配全部已读取摘要，未挂载的会话也能被找到。搜索词、范围或工作树切换时重置为 20 张并回到顶部；同范围后台刷新保留已加载页数和滚动位置。分页控制卡片挂载数量，摘要仍由现有 IPC 一次读取。

卡片首次展开才挂载正文，之后保留正文供收起与反向动画使用。稳定回调与 memo 隔离单卡切换的渲染；未变化的预览复用已完成或进行中的读取，事件和摘要变化仍刷新。交互边界与浏览器验证归 [卡片展开与响应](../../workbench/session-card-surface.md)。

## Alternatives considered

- 一次挂载完整列表最简单，但会重复点击后等待、再整批出现的现象。
- 立即扫描可最快发现外部记录，但扫描与首屏读取争用主进程。先显示已有列表，扫描结果稍后补齐。
- 定时分批挂载缓解首屏停顿，但用户未阅读的卡片最终也全部挂载，故改为滚动触底追加。
- 虚拟滚动能进一步压低大列表的 DOM 数量，但需要重做展开卡片的动态高度和滚动定位；目前采用每页 20 张的滚动追加。

## Consequences

首批卡片可以先于扫描结果出现，用户继续阅读才挂载后续页。全量摘要仍保存在客户端，滚过的卡片仍保留，并非虚拟滚动；用户浏览全部历史后 DOM 仍可增长到完整列表。扫描发现的新记录通过原有后台刷新更新。

短时间返回面板可能先展示旧摘要，停留后的补查和会话事件负责更新。此优化减少重复读取、扫描重启和未变化卡片的渲染，不缩短首次转录解析，也不保证桌面所有切换都没有长任务。

## Verification

2026-10-16，`npm run typecheck` 与 `npx eslint src/renderer/src/components/SessionPanel.tsx` 通过。设置本地 `NO_PROXY=127.0.0.1,localhost` 与空闲 `JANUS_E2E_PORT` 后，`npx playwright test tests/e2e/session-card-performance.spec.ts --project=island --workers=1` 三项通过：200 条摘要初始只挂载 20 张，等待不自动追加，中段滚动不加载，逐次触底按 20 张追加至末页；搜索、范围切换重置，后台事件保留已加载页；详情慢读、失败重试和快速开关继续正常。此为浏览器夹具证据，未进行真实桌面包长时测量。

2026-10-19，`right-tool-switch-performance.spec.ts` 以跨真实渲染帧的 8 次 Git／会话往返复现当前目录列表读取 9 次，优化后为 1 次，外部扫描不随切换重启；另验证无新事件时，返回缓存后停留仍能补上隐藏期间的变化。`npx playwright test tests/e2e/right-tool-switch-performance.spec.ts tests/e2e/right-dock-motion.spec.ts tests/e2e/session-card-performance.spec.ts tests/e2e/builtin-extensions.spec.ts --project=island --workers=1` 最终 11 项通过，输出在 `artifacts/right-tool-switch/final`。首轮订阅生命周期用例出现一次点击后仍停留文件标签的失败，单独复跑及完整回归通过，未将该偶发失败归因为本次读取优化。上述为真实组件加替身 IPC，不是桌面帧耗时保证。

`npx vitest run tests/unit/session-store.test.ts tests/unit/external-session-sync.test.ts tests/unit/right-tool-dock.test.ts tests/unit/right-tool-state.test.ts` 50 项通过，覆盖缓存过期、事件强制刷新、慢请求合并、未变化摘要引用、筛选切换旧响应隔离及隐藏扫描。`npm run typecheck`、三个变更源码文件的 ESLint 与 `npm run check:notes` 通过；Note 检查保留 17 条既有外部链接诊断。未重新打包或对真实桌面长时运行进行测量。
