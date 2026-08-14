import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['desktop-smoke.spec.ts', 'editor-definition.spec.ts', 'editor-find-widget.spec.ts', 'editor-window-tabs.spec.ts', 'blueprint-janus-capsule.spec.ts'],
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
