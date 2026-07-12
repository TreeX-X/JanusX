import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  root: resolve(__dirname, 'island-harness'),
  resolve: {
    alias: {
      '@': resolve(__dirname, '../../src/renderer/src'),
    },
  },
  plugins: [react()],
})
