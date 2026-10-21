import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

// Note: .agents/notes/remote/android-pairing-handshake.md
const root = fileURLToPath(new URL('../../', import.meta.url))
await build({
  absWorkingDir: root,
  entryPoints: ['src/main/remote-signal.ts'],
  outfile: resolve(root, 'artifacts/remote-signal/server.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // ws uses require for Node builtins and optional native accelerators.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  external: ['bufferutil', 'utf-8-validate'],
})
console.log('Built artifacts/remote-signal/server.mjs (Node.js 22+; no npm install needed on server)')
