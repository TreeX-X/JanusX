// Note: optional model assets must stay outside the app — see .agents/notes/knowledge/requirements/unified-memory-laya-primary.md
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { listPackage } from '@electron/asar'

const directory = process.argv[2]
assert(directory, 'Usage: node scripts/check-laya-package.mjs <win-unpacked directory>')
const resources = resolve(directory, 'resources')
const expected = ['model-manifest.json', 'requirements.txt', 'sidecar.py']
assert.deepEqual(readdirSync(join(resources, 'laya')).sort(), expected)
for (const file of expected) {
  const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex')
  assert.equal(hash(join(resources, 'laya', file)), hash(join('resources/laya', file)), `Packaged ${file} differs from source`)
}
const archive = listPackage(join(resources, 'app.asar')).map(path => path.replaceAll('\\', '/'))
assert(!archive.some(path => /(?:^|\/)resources\/laya(?:\/|$)/.test(path)), 'Laya source/cache tree leaked into asar')
assert(!archive.some(path => /\.safetensors$|(?:^|\/)(?:python\.exe|\.venv|torch)(?:\/|$)/i.test(path)), 'Optional model/environment leaked into asar')
console.log('Packaged Laya verified: three matching adapter files; no model weights or Python/torch environment in asar.')
