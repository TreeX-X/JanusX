import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

// Note: CI 内单进程顺序执行用例文件——见 .agents/notes/implemented/process/2026-09-17-verify-pipeline-harden.md
// Windows runner 上 200+ 文件逐个 fork 会高频触发 tinypool `Channel closed` /
// `ERR_IPC_CHANNEL_CLOSED`（常伴随 libuv `fs-event.c` 断言），本质是 fork 启停 churn +
// 文件 watcher 句柄在 IPC 通道上的竞态。CI 下用 singleFork 复用同一个子进程跑全量，
// 消除 200+ 次 spawn/teardown；本地保持并行速度。
const isCI = process.env.CI === 'true'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    watch: false,
    pool: 'forks',
    maxWorkers: isCI ? 1 : undefined,
    minWorkers: isCI ? 1 : undefined,
    fileParallelism: !isCI,
    // 顺序即确定性：CI 全量失败集合不再随调度漂移，本地 `CI=true` 即复现远端顺序。
    sequence: {
      shuffle: false,
    },
    poolOptions: {
      forks: {
        singleFork: isCI,
        isolate: true,
      },
    },
    // 未处理的 rejection 直接 fail 而不是静默吞掉尾部报告；Windows 下 worker 崩溃时
    // 至少保留可归因的用例级错误，而不是只有一句 `Channel closed`。
    dangerouslyIgnoreUnhandledErrors: false,
    testTimeout: 15000,
    hookTimeout: 15000,
    teardownTimeout: 5000,
  },
})
