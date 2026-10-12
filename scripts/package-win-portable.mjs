// Local iteration uses fast compression; release packaging keeps its defaults.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = process.cwd()
const args = process.argv.slice(2)
if (args.length && (args.length !== 2 || args[0] !== '--release-dir' || !args[1] || args[1].startsWith('--'))) {
  throw new Error('Usage: node scripts/package-win-portable.mjs [--release-dir directory]')
}
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const directory = resolve(args[1] ?? join(root, 'release', pkg.version))
const started = Date.now()
execFileSync(process.execPath, [
  join(root, 'node_modules/electron-builder/cli.js'), '--win', 'portable', '--x64', '--publish', 'never',
  `--c.directories.output=${directory}`,
], { cwd: root, stdio: 'inherit', env: { ...process.env, ELECTRON_BUILDER_COMPRESSION_LEVEL: '1' } })
console.log(`Portable iteration packaging: ${((Date.now() - started) / 1000).toFixed(1)}s`)
execFileSync(process.execPath, [join(root, 'scripts/check-packaged-runtime.mjs'), '--portable', '--release-dir', directory], { cwd: root, stdio: 'inherit' })
