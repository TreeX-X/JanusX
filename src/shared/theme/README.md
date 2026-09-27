# 主题系统（M1 统一结构）

调色只改 `definition.ts`，其余全部生成或派生。组件层禁止硬编码颜色，只吃语义令牌。

## 加一个新主题（3 步）

1. 在 `definition.ts` 仿 `PLANCHE_THEME_DEFINITION` 写一份 `ThemeDefinition`
  （`tokens` 必须覆盖 `tokens.ts` 的 `SEMANTIC_TOKENS` 全表，`xterm` 全量 21 键，
   `monaco.colors` 只允许 `#RRGGBB[/AA]`，测试会卡）。
2. 在 renderer 启动处调一次 `defineTheme(MY_THEME)`（`registry.ts`）。
3. 跑 `npm run theme:css`，提交生成的 `themes.generated.css`。

完成后面板自动出现：设置通用页下拉读 `listThemeDefinitions()`，
未知 id 经 `getThemeDefinition()` 回落 dark，永不白屏。

## 约定

- 组件文字/背景/边框只用 `var(--shell-*)` 等语义令牌（CSS）或
  `useThemeTokens()`（JS 动态色，如 Canvas 绘制）。
- `onMouseEnter` 改色迁到 CSS `:hover`；迁不掉的走 hook，不要写死 hex。
- 瞬态与语义色（红绿灯、扫描束、状态点）保留原值，只校验新主题下的可见度。
- 结构性皮肤（如灵动岛眼形、胶囊几何）不进 definition，手写 CSS 覆盖，
  选择器与 DOM 对齐（参考 `13-janus-planche.css`）。
- 改完 definition 必跑：`npm run theme:css && npx tsc --noEmit`
  + `npx vitest run tests/unit/theme-registry.test.ts`。
