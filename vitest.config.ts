import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
import { realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'

// Note: canonical temp paths avoid libuv's Windows short-path assertion — see .agents/notes/2026-09-20-reproducible-verification.md
// https://github.com/libuv/libuv/issues/5010: watcher events expand 8.3 names,
// but affected libuv versions compare them against the unexpanded directory.
// Set these before workers start so real filesystem tests use long paths too.
if (process.platform === 'win32') {
  const temp = realpathSync.native(tmpdir())
  process.env.TEMP = temp
  process.env.TMP = temp
}

// Keep CI's memory use bounded; serialization alone does not fix native watchers.
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
    // Do not shuffle CI test files; duration caching can still affect ordering.
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
