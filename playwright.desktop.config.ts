import { defineConfig } from '@playwright/test'
import { realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'

// Note: one path spelling across IPC and Monaco — see .agents/notes/2026-09-20-reproducible-verification.md
if (process.platform === 'win32') {
  const temp = realpathSync.native(tmpdir())
  process.env.TEMP = temp
  process.env.TMP = temp
}

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['desktop-smoke.spec.ts', 'desktop-harness-runtime.spec.ts', 'editor-definition.spec.ts', 'editor-find-widget.spec.ts', 'editor-window-tabs.spec.ts', 'blueprint-janus-capsule.spec.ts', 'knowledge-pipeline.spec.ts'],
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    trace: 'retain-on-failure',
  },
})
