---
{
  "schema": "harness-note/2",
  "id": "5f61e8cf-c615-4f45-b520-022cc99f609f",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-10-10",
  "class": "feature",
  "tags": ["product","surface"],
  "relations": [
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/b3704d91-c17d-4492-ae71-a44cfec8bbd7"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/908d675a-aec9-4791-8c8b-05f1e4c923ca"}
  ],
  "updated": "2026-10-10T08:56:32.429Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c"
}
---

# 创新实验功能预览管理与会话管理入口

## Problem

创新实验功能开关（`src/shared/ipc/experimental.ts` 的 `ExperimentalFeatures`、设置中心实验页 `ExperimentalSettingsPanel`、右坞门控 `isRightToolEnabled`）承载蓝图、知识库、圆桌、个人画像、远程协作控制、团队协作六路独立开关，但语料里没有任何 Note 记录这套机制的契约与取舍。会话管理（右坞 `sessions` 工具：卡片、时间线、详情与续接）此前不在预览管理内，无法随其他创新功能统一隐藏、灰度与回收；与此同时会话解析与还原点仍在完善期，入口常驻与成熟度不匹配。

## Decision

机制契约：`ExperimentalFeatures` 逐路布尔开关，`experimental:get/update` IPC 持久化到工作区配置，`normalizeExperimentalFeatures` 对缺席/非法一律回落默认值（默认全关 = 打包默认隐藏，仅设置中心开启后可用），无 IPC 环境以 `EXPERIMENTAL_ENABLED_ALL` 全开降级避免浏览器预览误杀。设置中心实验页分「预览」与「开发」两区（`PREVIEW_FEATURES`/`DEV_FEATURES`），每个开/关走逐项确认弹窗；知识库开关有键与文案但暂不在面板两区列表中。右坞入口统一经 `isRightToolEnabled(toolId, features)` 门控，`RightDock` 对被禁工具隐藏并关闭（重开启用后从关闭态开始），`RightToolRail` 不渲染被禁工具。

本次将**会话管理**纳入预览管理：`sessions` 开关进「预览」分区（与蓝图同区），**默认关闭**（对齐「默认全关」契约，缺席键回落 false），**关闭仅隐藏右坞入口**——会话账本、转录扫描、检查点与续接数据全部保留，重新开启即恢复（与团队协作「关闭仅隐藏入口」同语义）。`isRightToolEnabled` 增 `sessions` 门；`RightDock`/`RightToolRail` 的 features 实参补 `sessions`。

## Alternatives considered

- 会话开关默认开启 — 最强理由是已上线功能不隐身、升级无感。排除原因：预览管理的既定契约是「默认全部关闭，设置中心开启后可用」，例外会让七路语义分裂；用户明确定案默认关闭。
- 关闭时连外部转录扫描与入库一起停 — 最强理由是省后台开销。排除原因：门控语义应收敛在入口层（teamCollab 先例），停扫描改变数据面行为且重开后需要补扫逻辑，收益不成比例。
- 会话门控做成独立设置项而非实验开关 — 最强理由是会话偏核心功能。排除原因：用户明确要求进入创新功能预览管理，与其他创新功能同池灰度回收。
- 不建 Note 只留代码注释 — 最强理由是零文档开销。排除原因：机制契约（默认回落、降级全开、逐项确认、门控收敛点）是长期事实，此前缺失记录正是本次顺带补档的动因。

## Consequences

- **Gains**: 会话管理与其他创新功能同池管理——打包默认隐藏、设置中心逐项确认开/关、关闭仅隐藏入口；机制契约与取舍首次入档，后续新功能入池有据可循。
- **Costs and limits**: 默认关闭意味着旧配置与新装升级后会话面板不出现，需在设置中心「实验」页开启一次；`knowledge` 开关留在契约与文案但不进面板列表的现状照旧（归属 memory-domain-controls 的成熟度裁量）；门控只覆盖右坞入口，主进程侧会话扫描与 hook 采集不做开关级停用。
- **Verification**: `npm run typecheck` 干净（一次运行中出现的 `stores/blueprint.ts` 报错来自工作区并行未提交改动，复查后已自行消失，与本切片无关）；`npx vitest run tests/unit/experimental-features.test.ts tests/unit/right-tool-state.test.ts` 31/31 通过（七路 normalize、sessions 缺席回落 false、严格布尔强转、sessions 门控开/关）；`npm run i18n:types` 重生成 3310 keys，`npm run i18n:check` 双语同步；`npm run check:notes` 与 `node scripts/verify-note-corpus.mjs` 0 errors。
