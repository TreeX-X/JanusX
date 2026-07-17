import { defineConfig } from '@playwright/test'

const islandPort = 41731

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: 'desktop-smoke.spec.ts',
  timeout: 20_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: `http://127.0.0.1:${islandPort}`,
    viewport: { width: 1280, height: 720 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npx vite --config tests/e2e/island-vite.config.ts --host 127.0.0.1 --port ${islandPort} --strictPort`,
    url: `http://127.0.0.1:${islandPort}`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
