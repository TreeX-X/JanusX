import { afterEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stringify } from 'yaml'
import { publishWin, releaseFiles } from '../../scripts/publish-win.mjs'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function fixture(version = '1.0.0') {
  const root = mkdtempSync(join(tmpdir(), 'janusx-publish-test-')); roots.push(root)
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version }))
  writeFileSync(join(root, 'electron-builder.yml'), stringify({ productName: 'JanusX', publish: { provider: 'github', owner: 'owner', repo: 'repo' } }))
  const directory = join(root, 'release', version); mkdirSync(directory, { recursive: true })
  const setup = `JanusX-${version}-x64-setup.exe`, bytes = Buffer.from('setup')
  writeFileSync(join(directory, setup), bytes)
  writeFileSync(join(directory, `${setup}.blockmap`), 'blockmap')
  writeFileSync(join(directory, `JanusX-${version}-x64-portable.exe`), 'portable')
  const sha512 = createHash('sha512').update(bytes).digest('base64')
  writeFileSync(join(directory, version.includes('-') ? 'beta.yml' : 'latest.yml'), stringify({ version, path: setup, sha512, files: [{ url: setup, sha512, size: bytes.length }] }))
  return { root, directory, setup }
}

describe('Windows publication gate', () => {
  it('does no GitHub action if runtime validation fails', () => {
    const { root } = fixture(); const calls: string[] = []
    expect(() => publishWin(root, (command: string) => { calls.push(command); throw new Error('smoke failed') })).toThrow('smoke failed')
    expect(calls).toEqual([process.execPath])
  })
  it('rejects an altered installer before creating a release', () => {
    const { root, directory, setup } = fixture(); const calls: string[] = []
    writeFileSync(join(directory, setup), 'different')
    expect(() => publishWin(root, (command: string) => { calls.push(command) })).toThrow('hash and size')
    expect(calls).toEqual([process.execPath])
  })
  it.each(['1.0.0', '1.0.0-beta.1'])('verifies, uploads into a draft, then exposes the same files (%s)', (version) => {
    const { root } = fixture(version); const calls: { command: string; args: string[] }[] = []
    publishWin(root, (command: string, args: string[]) => { calls.push({ command, args }) })
    expect(calls[0].args).toContain('--portable')
    expect(calls.slice(1).map(({ args }) => args[1])).toEqual(['create', 'upload', 'edit'])
    expect(calls[1].args).toContain('--draft')
    expect(calls[1].args.includes('--prerelease')).toBe(version.includes('-'))
    expect(calls[2].args.slice(3, 7)).toEqual(releaseFiles(root).files)
    expect(calls[3].args).toContain(`--latest=${!version.includes('-')}`)
  })
  it('keeps a draft private when uploading fails', () => {
    const { root } = fixture(); const actions: string[] = []
    expect(() => publishWin(root, (command: string, args: string[]) => {
      if (command === 'gh') { actions.push(args[1]); if (args[1] === 'upload') throw new Error('upload failed') }
    })).toThrow('upload failed')
    expect(actions).toEqual(['create', 'upload'])
  })
})
