---
schema: harness-note/1
id: 908d675a-aec9-4791-8c8b-05f1e4c923ca
kind: decision
lifecycle: implemented
created: 2026-10-04
class: architecture
tags: [memory, knowledge, persona, settings, verification]
---

# 工程知识与个人画像独立控制、共用阅读入口

## Problem

只控制入口的开关会让用户在关闭画像后仍被采集或召回个人记忆；统一审核栏若仅依赖知识库开关，个人助手就不能独立使用。两个领域需要独立运行，详细设置提供个人记忆控制，同时在同一打开界面中查看工程知识与个人画像。本地资源、启停与模型验证由[自动处理需求](./2026-10-03-knowledge-accumulate-review-wiki-rereview--3944b368.md)承载，功能测试不能替代真实质量验收。

## Decision

工作台采用“知识与记忆”共用入口，工程知识与个人画像独立分区。任一创新开关开启时入口可用；关闭某域立即卸载对应内容。个人域提供画像与记忆、个人记忆审核、功能设置。右侧统一审核栏按启用域显示候选与筛选；只有个人域启用时不请求 Wiki、图谱或工程自动处理状态。存储、工程 MCP 输出及领域归属不因共用界面而合并。

创新功能设置将个人画像列入“开发中 · In Development”，蓝图和知识库列入预览功能。分组表达功能成熟度，不修改已保存的 persona 开关、领域授权或个人数据。个人记忆机制的后续重构安排在工程知识库打磨完成之后，方向见[重构讨论](./2026-10-07-knowledge-pipeline-reconstruction--c459c727.md)。相比继续列为预览功能，开发中分组更准确表达当前阶段，代价是入口位置变化；功能操作继续复用既有开关和确认交互。

个人设置独立持久保存，提供自动积累对话、从工程采集推断习惯、对话使用记忆及新近期记录 30–90 天保留期。工程习惯提取默认关闭，仅处理已有工程采集中的用户归因证据；知识库关闭时不会为此继续采集工程资料。保留期不追溯修改旧记录，长期确认事实不随近期记录到期。关闭自动采集后仍允许用户主动要求记住；关闭个人画像总开关则阻止个人采集、候选处理和召回，已有数据保留。

生产启动在队列恢复前安装领域策略；捕获入口及写锁内复核授权，处理队列跳过关闭域且保留游标，候选入库与精修结果检查领域授权。关闭对话使用记忆时，个人召回在读取前及返回前检查设置。底层存储和可注入测试实例不自行读取用户配置，领域策略由应用装配负责。本地模型部署继续独立授权；个人设置不启用本地运行，个人候选保持人工确认。

## Alternatives considered

保留现有入口与只控制显示的开关改动最少，但不能满足关闭个人记忆功能的语义，且个人审核仍依赖工程开关。合并总开关减少控件，却使只需要个人助手或只需要工程知识的用户被迫同时开启两个领域。完全独立窗口强调领域边界，但切换与管理成本更高。共用入口与独立分区复用已有组件，代价是需要验收四种开关组合与关闭时的异步结果。

## Consequences

创新开关从入口控制扩展到生产处理控制，旧安装中关闭的功能不会继续积累资料。已存内容不删除，重新开启后队列可处理未完成资料。个人信息读取与编辑复用现有画像组件，不增加第二套画像存储。工程自动模型管线与个人人工审核仍有不同能力边界；此设置不承诺个人记忆自动通过模型审核。

## Verification

2026-10-07：个人画像分组调整的 `npx vitest run tests/unit/experimental-features.test.ts --reporter=dot` 为 4 项通过，验证开关默认值、独立性和 IPC 契约；组件 ESLint 与 Note 检查通过。源码复查确认 persona 仅列于 DEV_FEATURES，中英文共用同一分组及已有标题词条。本次未执行浏览器视觉验收。

最终全仓 `npm run test:unit -- --run --maxWorkers=3 --reporter=dot` 为 334 个文件通过、1 个文件失败、3 个文件跳过；2,701 项通过、1 项失败、5 项跳过。唯一失败是 agent-notes-check 对既有跨仓源码链接的严格检查：[圆桌循环 Note](./2026-09-16-roundtable-chat-harness-loop--f8f6586b.md)与[统一 Note/蓝图 Note](./2026-09-16-unified-note-blueprint-harness--1b210a76.md)共六处 janus-agentX 源码引用无法解析；未修改这些无关链接或放宽测试。`npm run check:notes` 的结构检查为 235 篇、0 errors、27 项显式链接诊断，结构通过不能替代上述严格链接检查。显式本地实验另行运行，不能把默认跳过项计为通过。

2026-10-04：`tests/unit/knowledge/memory-domain-controls.test.ts` 的 6 项测试检查领域关闭、30 天新记录保留期、显式记住、关闭时保留队列游标、写入前二次授权、真实确认记忆的召回门禁及重开恢复。浏览器复验使用真实 React 组件与 IPC 替身，`knowledge-automation-ui.test.ts` 的 7 项覆盖个人独立打开、设置即时保存、知识设置不被覆盖、审核入口组合与禁用卸载；`memory-review-ui.test.ts` 的 7 项覆盖快照、替代、审核失败及工程精修。深色与 planche、640×720 个人设置截图人工检查通过，未发生横向溢出。

`JANUSX_DESKTOP_ENTRY=artifacts/build-check/main/index.js npx playwright test --config playwright.desktop.config.ts tests/e2e/knowledge-pipeline.spec.ts` 通过 1 项：隔离 Electron 配置走真实 preload/IPC，覆盖采集、审核、正式知识、检索、画像编辑、遗忘、迁移，以及四种 knowledge/persona 组合的实际采集门禁；个人设置保存不修改工程设置。`npm run typecheck:strict-unused`、`npm run build:check`、`npm run i18n:check`、包边界和打包排除检查通过；变更源文件 ESLint 无错误，KnowledgeWorkbench 的既有 refresh effect 依赖警告保留。

本机真实 Qwen3.5-4B Q5_K_M、llama.cpp b11277 Vulkan、RTX 4060 Laptop 运行 `JANUSX_QWEN_SMOKE=1 npx vitest run tests/unit/knowledge/knowledge-local-smoke.test.ts --maxWorkers=1 --reporter=verbose`，以 `-t 'small handbook'` 和 `-t 'longer handbook'` 分别执行基础与长资料专项。基础生成、复核、长中文分词和进程释放验证实际加载 65,536 tokens；检查时可用显存约 6,633 MiB。复用安装资源的基础专项通过耗时 35.92 秒。长手册专项使用 78,388 字节、八主题资料，以生产生成模板保留所有关键数值与例外，复核覆盖八条来源，故意把 7 天改成 3 天被判 unsupported。长手册通过耗时 58.57 秒。128K/256K 与其他 GPU 未实测，容量预算单测不替代硬件实测。

长资料初次无限制思考没有完整返回；生成的 1,024 token 思考预算给正文保留输出空间，接口将非 stop 结束明确报告为 incomplete-model-output。预算复验的一次自定义提示返回 `[id]: backup` 引用形式，不符合该临时测试的方括号断言；生产的来源绑定由宿主 generatedSections 维护，因此最终专项采用生产模板并检查内容及独立复核，未用模型生成的引用标记替代宿主来源检查。原始失败记录保留，本结论不证明任意长文都能生成。

使用 `scripts/benchmark-qwen-reviewer.py` 对已有原集与扩展集合计 164 条样例执行三次非思考审核，共 492 次有效调用，耗时 650.86 秒，中位延迟 1,219 ms。三次准确率分别为 95.12%、94.51%、95.12%，错误放行分别为 2、3、2 条。三次一致规则仍误放行 preference-quote 与 numeric-conflict，expanded-32-no 出现动作波动；一致放行精度 97.98%，正确通过覆盖率 94.17%。基准使用 8K 上下文，测量模型原始判断，不等于生产 64K 全管线验收。这是固定合成集测量，qualityGate 为 not-evaluated-synthetic；不能宣告独立生产质量验收通过。模型 SHA-256 为 `8814232b85594dcd46c50e5b8b29324a7efe9e746edbe8a3d1df3d3fce7aad39`，基准脚本 SHA-256 为 `2d2b1b43889b7fb82332e335f867a05d90d76623d41e55cd37a9b9ee54db6d52`。未修改真实用户自动入库配置。

首次公网安装通过 33,095,916 字节运行程序下载、哈希和解压；权重下载到 458,571,011 / 3,143,656,608 字节后返回 local-download-failed，临时片段清理，完整运行程序保留。随后将已有同版本权重复制到隔离缓存，生产安装器重新校验并进入 ready，推荐 64K；此结果仅验证资源复用，不算首次完整权重公网下载通过。测试产物位于本机 `artifacts/memory-domain-acceptance/`，不进入发布包或版本库。首次全量网络下载、真实独立标注、真实外部提供方组合、其他硬件及长期质量仍是未通过或未执行项。
