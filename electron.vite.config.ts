import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({
      exclude: ['@janusx/llm-core', '@janusx/llm-core/model-registry']
    })],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          'knowledge-mcp': resolve(__dirname, 'src/main/knowledge/knowledge-mcp.ts'),
          'office-mcp': resolve(__dirname, 'src/main/office/office-mcp.ts'),
          'office-launcher': resolve(__dirname, 'src/main/office/office-launcher.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    server: {
      host: '127.0.0.1',
      // 5173 常被 Windows winnat/Hyper-V/WSL2 保留（netsh excludedportrange），会报 EACCES，改用实测空闲的 5799
      port: Number(process.env.ELECTRON_VITE_PORT) || 5799,
      strictPort: false
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src')
      }
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      }
    }
  }
})
