# 为 JanusX 做贡献

> 人类与 agent 共用同一套标准。决策背景见 `.agents/notes/implemented/process/2026-09-17-github-maintenance.md`。

## 分支与 PR

- `main` 是稳定主分支，`develop` 是长期开发分支。日常改动在 `develop` 完成，本地 `npm run verify` 通过后推送，再创建 `develop` → `main` 的 PR；PR 的 `verify` 通过且满足审核规则后才能合并，禁止直推 `main`。
- `develop` → `main` 使用 merge commit 保留共同历史，避免长期分支反复 squash 后重复携带已合入提交。合并后将 `main` 同步回 `develop`：`git fetch origin`、`git switch develop`、`git merge --ff-only origin/main`、`git push origin develop`。若无法快进，先合并 `origin/main`、解决冲突并重新验证，禁止强推覆盖其他开发。
- 管理员仅在 CI 故障等紧急情况可 bypass，事后在 PR 或 Issue 留书面说明。
- Agent 落地（`xdo`/`xdel`/`xflow`）同样走 PR，紧急修复例外，理由写进 Note。
- PR 标题沿用提交风格（如 `xdo: …`），描述填 Issue 号与 Note 路径（模板自动加载）。
- 每批开发保持明确范围，及时合入主分支。需要隔离的实验可使用短期功能分支，交付后删除；不复用修复分支积累其他功能。`develop` 长期保留，`gh-pages` 作为官网来源独立保留，worktree 分支在对应工作区结束后清理。决策见 `.agents/notes/2026-09-20-development-branch.md`。

## CI

- 面向 `main` 的 PR，以及 `main`、`develop` 推送自动跑 `verify`（Windows runner）：typecheck、单测、构建、边界检查、lint、i18n、桌面冒烟。红灯不合；`develop` 的推送检查用于提前发现故障，PR 检查验证与主分支的合并结果。
- 本地先跑 `npm run verify`，不要把红灯推上去浪费 CI 分钟数。
- Node 版本以 `.node-version` 为准；两个 workflow 固定同一 `janus-agentX` commit，升级同级依赖时一起更新并验证。
- `npm run verify` 包含仓库 Note 检查。未提交的 `.claude/skills` 和 `.codex/skills` 由本机维护者使用 `npm run check:skills-sync` 检查；`npm run verify:local` 连同该检查一起执行。产品 CI 和单测不依赖个人技能目录。

## 版本与 tag

- 小写 `v`，`vX.Y.Z`，与 `package.json` 的 `version` 严格一致；先改版本再打 tag。
- 日常迭代打小版本（如 `v0.8.7`）；历史大写 `V*` tag 已冻结，不再使用、不删除。
- 真正的内测版格式为 `v1.0.0-beta.N`，仅由维护者声明使用；使用前 `package.json` 的 `version` 必须同步为同一 prerelease。

## Release（tag 驱动，无手动发版步骤）

- 推送 `v*` tag → `release-win` 自动构建 → 自动创建公开 Release 并上传安装包与 `latest.yml`。`Version guard` 校验 tag 与包版本，错位直接失败。
- 内测注意：任何 `v*` tag 都会公开发布，不存在"静默内测 tag"。版本带 prerelease 后缀时，workflow 自动创建 GitHub prerelease；tag 必须仍与 `package.json` 完全一致。
- Windows 发布固定为 x64，workflow 在打包前下载固定版本 OfficeCLI 并核验 SHA256。历史大写 tag 不自动转换，也不补发版本。
- 禁止 draft Release：更新 feed 与落地页读不到 draft。
- 本地打版走 `npm run release:tag -- <版本>`（如 `npm run release:tag -- 0.8.8`）：脚本依次校验工作树干净、`main` 与远端同步、版本号递增、tag 不存在，再改版本提交并打 annotated tag；默认只做到本地，加 `--push` 才推送（推送即公开发布，有二次确认）。发版说明模板自动生成为 `release-notes-vX.Y.Z.md`（不入库），CI 建好 Release 后用 `gh release edit <tag> --notes-file <模板>` 或网页编辑填入正文。

## Issue

- 三模板：Bug 反馈 / 功能建议 / 内测反馈（空 issue 已关闭，必须套模板）。
- label 由维护者打：`beta-feedback`（内测反馈）、`release`（发版相关），其余沿用默认 label。
- 里程碑跟踪进度：`Beta 内测`、`v1.0 正式版`。
