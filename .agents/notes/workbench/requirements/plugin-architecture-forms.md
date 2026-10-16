---
{
  "schema": "harness-note/2",
  "id": "96a2f5cd-166e-4982-a444-7640858f0a5f",
  "kind": "requirement",
  "lifecycle": "draft",
  "created": "2026-09-09",
  "class": "architecture",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-09-agent-note-plugin-architecture-forms-selection--96a2f5cd.md",
      "sourceHash": "bb00f53999e5e0e4c094c057c2fee217cd57daa1c39a3eb269f822e4fb9ef17d",
      "originalBodyHash": "b37748cb72d6d93be29cab1980b8e2a879ac24e31c2eb465b9f288f2b027d7c1",
      "category": "formal",
      "reason": "Retains the source requirement in draft lifecycle; body documents Plugin architecture forms selection. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/proposed/architecture/2026-09-09-plugin-architecture-forms.md",
        "sourceHash": "bb00f53999e5e0e4c094c057c2fee217cd57daa1c39a3eb269f822e4fb9ef17d",
        "originalBodyHash": "b37748cb72d6d93be29cab1980b8e2a879ac24e31c2eb465b9f288f2b027d7c1"
      }
    }
  },
  "updated": "2026-10-16T03:30:37Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c"
}
---

# Plugin architecture forms selection

## Expected behavior

工作台扩展应通过稳定的贡献协议接入中部与右侧，避免每增加工具都修改容器与图标分支。S1 已提供可信渲染器注册与生命周期；主进程、preload、第三方授权和包加载仍沿用既有边界，不能将视图注册当作第三方安全机制。后续按阶段补齐内置工具迁移、隔离 UI、包格式与分发。

## Proposal

Adopt the forms in delivery order. Now: A in-code contributions (the [slot registry proposal](./island-rightdock-slots.md)) plus E `@janusx/plugin-sdk` (shared types, `definePlugin`, manifest schema, scaffold generator) plus D headless capabilities over existing MCP subprocess entries. Next: C sandboxed UI through a curated `window.janusPlugin` bridge (`sandbox="allow-scripts"` baseline, never top navigation, per-method authorization by plugin id plus permission). Last: B user-directory loading with signatures and an explicit switch, default off. Hold three permanent red lines: plugin JS never enters the main process, plugins never receive a bare renderer bridge, and remote URLs never load plugin code directly. Define manifest v1 (`id`, `version`, `engines` semver, permission allowlist, `contributes`), the discover-validate-activate-deactivate-uninstall lifecycle, and a `plugins:check` verify gate that rejects out-of-manifest calls.

当前实施顺序以[插件平台分阶段交付计划](../../planning/plugin-platform-roadmap.md)为准，先交付中部与右侧通用扩展接口，再按文件树、Git、会话管理的顺序迁移内置工具。内置扩展随应用发布并保留可信 React 运行方式；第三方 UI 隔离运行，通过受限桥调用授权能力。共享贡献协议不等于共享权限，外部服务网页也不获得插件桥。原宿主继续拥有文件服务、Git 操作、会话执行及持久化。

清单按需声明中部页面和右侧面板、稳定视图身份及应用级／项目级作用域。S1 已交付 `src/renderer/src/extensions/` 的可信代码贡献定义、动态注册与视图宿主；右侧静态工具与动态扩展合并，中部通过通用 extension pane 承载。宿主管理入口、容器、内存布局恢复、激活／停用、资源释放和错误处理，作者维护页面与业务状态。应用级 Tab 切换项目时转移，项目级 Tab 随项目快照恢复；跨容器或项目重挂载不承诺保留 React 局部状态。现有内置内容分支归 S2 迁移，不扩大到全部 Island 或助手工具。第三方清单加载与隔离尚未实现，当前定义只供可信应用代码使用。

## Alternatives considered

- Directory loading first for release-free customization — strongest case is team PoC and customer variants without a release train. The driver that rules it out is trust inversion: full-permission renderer JS before any signature or version-skew design exists.
- Sandbox iframe for everything — strongest case is one uniform isolation story. The driver that rules it out is composition loss: no shared React components, hooks, or stores across the bridge, with degraded drag, menus, and shortcuts.
- Do nothing / reuse hand-written allowlists — staying put keeps the current review gates sufficient. The cost is that every integration remains a five-layer manual patch and third-party capability stays impossible.

## Acceptance criteria

- [ ] AC-1: The SDK package plus scaffold generates a preview contribution that typechecks under the existing verify chain.
- [ ] AC-2: The main host recognizes an unsigned directory plugin but refuses to execute it with an explicit error plus log.
- [ ] AC-3: One read-only sandboxed sample plugin runs through the curated bridge with timeout and error states.
- [ ] AC-4: The verify gate rejects a manifest-external method call automatically.
- [x] AC-5: 中部与右侧均可通过统一贡献协议注册、打开及关闭视图；新增使用已有能力的视图无需修改容器代码，一个示例可同时贡献两处视图。
- [ ] AC-6: 文件树、Git、会话管理依次通过内置扩展注册，保留现有功能、实验开关、快捷键、顺序、宽度偏好及状态恢复；关闭会话面板不终止会话或改变持久化。
- [x] AC-7: 应用级视图跨项目复用，项目级视图的上下文与状态按项目隔离；禁用或卸载清理入口与视图资源，恢复已失效的视图 ID 不崩溃。
- [ ] AC-8: 内置扩展、隔离第三方页面与外部服务网页各自遵守运行边界；同一插件的中部及右侧视图可通过受限接口共享状态，页面不能直接获得宿主完整桥。

## Risks

- Deferring directory-loading security invites half-open states; the host phase must recognize without executing, never partially run.
- Persisted registries meet unknown plugin ids after uninstall; filter with an empty state rather than crashing.
- Keep-alive and bridge memory need measurement before the sandboxed form is declared done.

## Verification

2026-10-16 S1：扩展核心与宿主相关的 8 份单元测试共 121 项通过，`tests/e2e/extensions.spec.ts` 5 项浏览器真实组件用例通过，既有 pane 拖拽与右侧动效 25 项通过，真实 Electron 的既有关键路径 smoke 1 项通过。AC-5、AC-7 的勾选限定于可信扩展与既有内存快照机制；第三方权限隔离和持久化包格式不在此证据内。命令、验证限制和后续范围归[阶段交付记录](../../planning/plugin-platform-roadmap.md)。
