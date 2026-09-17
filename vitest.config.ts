import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

// Note: CI 内单进程顺序执行用例文件——见 .agents/notes/implemented/process/2026-09-17-verify-pipeline-harden.md
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
    maxWorkers: isCI ? 1 : undefined,
    fileParallelism: !isCI,
  },
})
