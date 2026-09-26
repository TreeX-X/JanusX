---
schema: harness-note/1
id: 77fa3727-6536-47d7-8bfd-613db717e4ac
kind: initiative
lifecycle: accepted
created: 2026-09-26
class: architecture
tags: [blueprint, performance, parent, governance]
---

# 蓝图性能父域

## Goal

进入蓝图不再经历秒级全量重扫与 25 帧逐批挂载：热缓存命中时进入一次读缓存完成，focus 返回与无关写入零开销，真变更走增量补丁。性能回归先看本域树。

## Scope

主进程常驻增量索引：读路径走缓存，watcher 先哈希探针再定补丁或全量，传输只带瘦身快照与卡片元数据。渲染单次提交挂载，CSS stagger 保留入场动画，布局缓存按稳定键命中，刷新按 rev 门控。启动空闲预热各 checkout 索引。

合并 listing 与 load 双 IPC 的方案已否决：缓存命中后两次调用皆为廉价读，省一次往返不值得新增通道；一致性由 rev 门控保证。服务端布局搬迁已否决：同等墙钟效果由稳定键缓存达成，改动小一个数量级。

## Acceptance criteria

- [x] AC-1: 进入蓝图无全量解析：热缓存下 projection 零 YAML/mdast 重算，传输不带全文。
- [x] AC-2: 无关刷新零开销：focus 返回与无变更事件不触发 reload，真变更走补丁或单次全量。
- [x] AC-3: 首屏一次提交：节点一次性挂载，动画纯 CSS，无 JS 分批。
