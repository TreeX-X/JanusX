# 打包流程问题与优化分析

2026-10-11 原始分段实测。2026-10-12 已落实入口检查、依赖刷新、发布前验证和 llm-core 增量编译。下表是优化前的 warm 分段记录，不能当作优化后的端到端性能结论。

## 实测分段（warm）

| 阶段 | 耗时 | 占比 | 说明 |
| --- | --- | --- | --- |
| `prepackage` = `npm install --install-links` | 4s | 2% | "up to date"，树干净时几乎免费 |
| `build`（llm-core tsc + electron-vite） | 58s | 31% | renderer 47.5s 占大头（monaco ts.worker 13MB、editor-find 7.7MB） |
| `check:package-boundary` | 1s | — | **rc=1 失败，见问题 ①** |
| `exclusions:sync` | 5s | 3% | `npm ls` + 重写排除块 |
| `electron-builder --win`（nsis + portable） | 93s | 50% | win-unpacked + asar + 双目标 LZMA + blockmap |
| `check:portable-runtime --portable` | 26s | 14% | 预算门 + 4 次冒烟 + 7za 解包 + stub 验证 |
| **合计** | **≈3 分 7 秒** | | 全部通过时 |

预算结果：payload 173.9 MiB，unpacked 12.3 MiB，portable 130.4 MiB。

## 已确认并修复的问题

### ① boundary 检查与 vite 入口漂移（已修复）

`electron.vite.config.ts` 把 main 入口 `knowledge-mcp` 改成了 `note-mcp`（`src/main/knowledge/knowledge-mcp.ts` → `src/main/blueprint/note-mcp.ts`，未提交重构），但 `scripts/check-package-boundary.mjs:27` 的 `REQUIRED_OUTPUTS` 仍要求 `out/main/knowledge-mcp.js`。流水线在 boundary 步骤 rc=1 中断，走不到 electron-builder。

已修复：检查从 `package.json` 的 main 与 bin 声明读取实际入口，另保留 preload 与 renderer 固定输出检查。入口改名不再需要维护第二份 MCP 文件名。

### ② `prepackage` 未实现其声称的「强制重新物化」（已修复）

note（`command-error-self-heal-parity`）写明 `prepackage`（`npm install --install-links`）的目的为「每次打包强制重新物化 file: 依赖，杜绝静默过期」。实测 npm 11 **不会**这么做：

- `.package-lock.json` 中 file: 依赖（`@janus-agent/*`）只有 `resolved`，无 `integrity` 字段；
- 探针实测：向 `../janus-agentX/packages/agent-core/dist/index.js` 追加内容后跑 `npm install --install-links`，`node_modules/@janus-agent/agent-core/dist/index.js` **原样未变**；
- 树干净时它 4 秒返回 "up to date"——快恰恰是因为什么都没做。

后果：「janus-agentX 更新后静默消费旧 dist」（物化即冻结）的风险仍然开着；note 记录的防御并不存在。反向问题也在：sibling 缺失时整个 `npm install` ENOENT 失败（preview-portable-redelivery 2026-10-07 已踩过）。

已实现 `scripts/prepare-package.mjs`：用 npm 的发布文件清单比对文件集合与 SHA256，仅让变化包的安装目录和 lockfile 记录失效，再交给 npm 重装并解析新依赖；安装后逐文件复核。不直接覆盖 dist，以免残留已删除文件或漏装新增依赖。保留每次 npm install 的依赖树协调；不承诺亚秒级。sibling 和构建入口缺失时明确失败，打包前仍须先构建 sibling。

## 优化空间（按收益排序）

1. **electron-builder（原分段记录 93s）**：当前安装版本的 nsis 与 portable 共享 AppPackageHelper，按架构复用应用压缩包，并非各自完整压一次 LZMA。相同 out 的对照中，双目标打包 81.6s，默认 portable 单目标反而为 181.3s：前者用 nsis 的小字典、非 solid 配置，后者默认 solid 压缩更重。新增 `npm run package:win:portable` 在迭代子进程中采用压缩级别 1，并保留完整检查；正式发行仍为双目标默认压缩。store 可能突破 portable 200 MiB 预算，未采用。
2. **换掉 `prepackage` 实现**：已修复问题 ②，以正确刷新为目标，保留 npm 安装协调，不把额外内容扫描称为提速。
3. **build（原分段记录 58s）**：llm-core 已改 `tsc -b` 增量，tsbuildinfo 位于 dist 内，删除 dist 即重置缓存。renderer 继续完整生产构建。
4. **重复构建**：verify 及对应 CI 先构建 llm-core 供测试使用，后续改用 build:app，避免再次编译 core。release CI 本就只完整构建一次；本地先 verify 再 package 仍会重新构建应用，当前不引入跨命令产物缓存。两个 npm ls 扫描保留独立核对。
5. **体感慢的定位**：原 warm 分段相加约 3 分钟；冷启动、依赖变化和 OfficeCLI 下载没有本次分段对照数据，耗时异常时应分别记录这些阶段，而非直接归因。

## 发布正确性

已将 release CI 与本地 package:win:publish 改为先打包并禁用自动发布，publish:win 再运行 neutral-directory 冒烟并核对安装包与更新清单的 SHA512、大小和版本，随后用 gh 上传到草稿，成功后公开。同一批产物只打包一次；GitHub CLI 须已认证，版本 tag 须已推送。已有 Release 不覆盖；上传失败保留草稿，重试前须人工处理该草稿。

## 优化后验证（2026-10-12）

以下为本机单次 electron-builder 阶段计时，不含源码构建、npm 和运行时验证，不能直接视为端到端提速比例。

| 配置 | 打包阶段 | portable 大小 | 用途 |
| --- | --- | --- | --- |
| 双目标默认压缩 | 81.6s | 130.5 MiB | 正式发行 |
| portable 单目标默认压缩 | 181.3s | — | 对照测量，不推荐用于提速 |
| portable 单目标压缩级别 1 | 60.1s | 162.2 MiB | 本地迭代 |

快速迭代的打包阶段比双目标本次记录短约 26%，代价是 portable 增大约 24%，仍低于 200 MiB 预算。llm-core 的隔离测试中，冷编译约 1.7s、未变内容的增量编译约 0.12s；删除 dist 后产物与增量缓存均可重建。

验证产物分别位于 `artifacts/packaging-optimization-verified-20261012` 和 `artifacts/packaging-portable-fast-verified-20261012`。相关单测 19 个、llm-core 测试 74 个通过；双目标与快速 portable 的 unpacked、portable payload 和 stub 冒烟均通过，正式安装包与更新清单的 SHA512/大小一致。GitHub 操作仅用模拟调用验证顺序和失败阻断，没有执行远程发布。

根目录 `npm run typecheck -- --incremental false` 仍报既有错误：`src/main/blueprint/note-mcp-server.ts:48` 向 readPage 传入类型未声明的 expectedHash。这部分源码不在打包优化改动内；因此不宣称完整 verify 通过。

## 不建议动（已有决策记录）

- **verbatim copy + 416 条排除**：`electron-builder.yml` 的 node_modules 原样拷贝设计是 hoisted-deps 事故（0.8.7 包启动即死）的修复，备选（node-dep-tree 重导、staging copy）已在 `packaged-hoisted-deps` / `packaged-runtime-size` 两篇 decision note 中评估否决。walk 成本已含在 electron-builder 93s 内，属设计内在代价。
- **`check:portable-runtime` 冒烟（26s）**：便宜且真能拦 ERR_MODULE_NOT_FOUND，保留。
