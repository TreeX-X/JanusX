import { build } from 'esbuild'
import { copyFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const output = resolve(root, 'apps/android-lab/app/build/generated/terminalAssets/terminal')
await mkdir(output, { recursive: true })
await build({ entryPoints: [resolve(root, 'apps/android-lab/terminal/terminal.ts')], outfile: resolve(output, 'terminal.js'), bundle: true, format: 'iife', target: 'chrome80' })
for (const name of ['index.html', 'boot.js', 'terminal.css']) await copyFile(resolve(root, 'apps/android-lab/terminal', name), resolve(output, name))
await copyFile(resolve(root, 'node_modules/@xterm/xterm/css/xterm.css'), resolve(output, 'xterm.css'))
await copyFile(resolve(root, 'node_modules/@xterm/xterm/LICENSE'), resolve(output, 'xterm-LICENSE.txt'))
