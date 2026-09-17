import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

// Note: CI 内顺序执行用例文件以避开 Windows runner 的 worker 崩溃 — see .agents/notes/implemented/process/2026-09-17-verify-pipeline-harden.md
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
    pool: 'forks',
    maxWorkers: isCI ? 2 : undefined,
    fileParallelism: !isCI,
  },
})
