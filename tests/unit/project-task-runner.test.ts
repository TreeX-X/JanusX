import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { listProjectScripts, resolveProjectTestScript, runProjectTest } from '../../src/main/project/runner/task-runner'

const roots: string[] = []

async function project(manifest: object): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'janusx-project-task-'))
  roots.push(root)
  await writeFile(join(root, 'package.json'), JSON.stringify(manifest))
  return root
}

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))))

describe('project task runner', () => {
  it('lists only safe package script names', async () => {
    const root = await project({ scripts: { 'test:unit': 'node -e "process.exit(0)"', 'bad name': 'echo no' } })
    await expect(listProjectScripts(root)).resolves.toEqual({ 'test:unit': 'node -e "process.exit(0)"' })
  })

  it('runs a declared test script and captures its result', async () => {
    const root = await project({ scripts: { test: 'node -e "console.log(\'task-ok\')"' } })
    await expect(runProjectTest(root, 'test')).resolves.toMatchObject({
      command: 'npm run test',
      script: 'test',
      exitCode: 0,
      timedOut: false,
      output: expect.arrayContaining(['task-ok']),
    })
  })

  it('resolves the exact manifest command for approval preview', async () => {
    const root = await project({ scripts: { 'test:unit': 'vitest --run' } })
    await expect(resolveProjectTestScript(root)).resolves.toEqual({ name: 'test:unit', command: 'vitest --run' })
  })

  it('rejects undeclared scripts', async () => {
    const root = await project({ scripts: { test: 'echo ok' } })
    await expect(runProjectTest(root, 'test;rm')).rejects.toThrow('not found')
  })
})
