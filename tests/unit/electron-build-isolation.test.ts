import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolveConfig } from 'electron-vite'

// Note: a live process must retain its lazy chunks across validation builds — see
// .agents/notes/2026-09-20-reproducible-verification--914a7e92.md
const repo = resolve(import.meta.dirname, '../..')
const scripts = JSON.parse(await readFile(join(repo, 'package.json'), 'utf8')).scripts as Record<string, string>
const devOut = scripts.dev.match(/--outDir\s+(\S+)/)?.[1] ?? 'out'
const checkOut = scripts['build:check']?.match(/--outDir\s+(\S+)/)?.[1]
const fixtures: string[] = []
const execFileAsync = promisify(execFile)

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function fixture() {
  await mkdir(join(repo, '.cache'), { recursive: true })
  const root = await mkdtemp(join(repo, '.cache/build-isolation-'))
  fixtures.push(root)
  await mkdir(join(root, 'src/main'), { recursive: true })
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'build-isolation-fixture', type: 'module', main: 'out/main/index.js' }))
  await writeFile(join(root, 'electron.vite.config.mjs'), `export default { main: { build: { rollupOptions: { input: ${JSON.stringify(join(root, 'src/main/index.js'))} } } } }`)
  await writeFile(join(root, 'src/main/index.js'), `export const propose = async () => (await import('./service.js')).proposal`)
  const generations = async (entries: Array<[string, string]>) => {
    // Use Node's native ESM cache, not Vitest's transformed module cache. All
    // outputs are absolute: electron-vite resolves a relative outDir from cwd.
    const script = `
      import { build } from 'electron-vite'
      import { writeFile } from 'node:fs/promises'
      import { join } from 'node:path'
      import { pathToFileURL } from 'node:url'
      const { root, entries } = JSON.parse(process.argv[1])
      const running = []
      for (const [outDir, value] of entries) {
        await writeFile(join(root, 'src/main/service.js'), 'export const proposal = ' + JSON.stringify(value))
        await build({ root, build: { outDir: join(root, outDir) }, logLevel: 'silent', ignoreConfigWarning: true })
        running.push(await import(pathToFileURL(join(root, outDir, 'main/index.js')).href))
      }
      console.log(JSON.stringify(await Promise.all(running.map(module => module.propose()))))
    `
    const { stdout } = await execFileAsync(process.execPath, ['--input-type=module', '--eval', script, JSON.stringify({ root, entries })], { cwd: repo, timeout: 30_000 })
    return JSON.parse(stdout.trim()) as string[]
  }
  return { root, generations }
}

describe('Electron output ownership', () => {
  it('reproduces the missing lazy module when two generations share an output directory', async () => {
    const { generations } = await fixture()
    await expect(generations([['out', 'before'], ['out', 'after']])).rejects.toThrow(/Cannot find module/)
  }, 30_000)

  it('keeps a running dev proposal import intact when production is rebuilt', async () => {
    const { generations } = await fixture()
    // The service is deliberately not imported until after the other build finishes.
    expect(await generations([[devOut, 'running'], ['out', 'next']])).toEqual(['running', 'next'])
  }, 30_000)

  it('launches the dev entry beside its matching preload and preserves resource depth', async () => {
    const entry = scripts.dev.match(/--entry\s+(\S+)/)?.[1]
    expect(entry).toBeTruthy()
    const { config } = await resolveConfig({ root: repo, build: { outDir: devOut } }, 'serve', 'development')
    const main = resolve(repo, config!.main!.build!.outDir!)
    const preload = resolve(repo, config!.preload!.build!.outDir!)
    expect(resolve(repo, entry!)).toBe(join(repo, 'scripts/dev-entry.mjs'))
    expect(main).toBe(join(repo, '.cache/main'))
    expect(resolve(main, '../preload')).toBe(preload)
    expect(resolve(main, '../../resources')).toBe(join(repo, 'resources'))
  })

  it('validates in a third directory without replacing dev or production chunks', async () => {
    expect(checkOut).toBeTruthy()
    const { root, generations } = await fixture()
    expect(await generations([[devOut, 'dev'], ['out', 'production'], [checkOut!, 'verification']])).toEqual(['dev', 'production', 'verification'])
    expect(dirname(join(root, checkOut!, 'main/index.js'))).not.toBe(join(root, devOut, 'main'))
  }, 30_000)
})
