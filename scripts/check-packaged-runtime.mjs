import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { listPackage } from '@electron/asar'

const root = process.cwd()
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const releaseDirectory = join(root, 'release', packageJson.version)
const appAsar = join(releaseDirectory, 'win-unpacked', 'resources', 'app.asar')
const unpackedExecutable = join(releaseDirectory, 'win-unpacked', 'JanusX.exe')
const portableExecutable = join(releaseDirectory, `JanusX-${packageJson.version}-x64-portable.exe`)
const verifyPortable = process.argv.includes('--portable')

for (const requiredPath of [appAsar, unpackedExecutable]) {
  if (!existsSync(requiredPath)) throw new Error(`Packaged runtime artifact missing: ${requiredPath}`)
}

const asarEntries = new Set(listPackage(appAsar))
for (const requiredEntry of [
  '\\node_modules\\ai\\package.json',
  '\\node_modules\\@langchain\\langgraph\\package.json',
  '\\node_modules\\@langchain\\core\\package.json',
  '\\out\\main\\index.js',
]) {
  if (!asarEntries.has(requiredEntry)) throw new Error(`app.asar runtime entry missing: ${requiredEntry}`)
}
if (![...asarEntries].some((entry) => /^\\out\\main\\chunks\\LlmService-.*\.js$/.test(entry))) {
  throw new Error('app.asar LlmService chunk missing')
}

async function runSmoke(executable) {
  const profile = await mkdtemp(join(tmpdir(), 'janusx-llm-runtime-smoke-'))
  try {
    await new Promise((resolvePromise, reject) => {
      const child = spawn(resolve(executable), [
        '--smoke-test=llm-runtime',
        `--user-data-dir=${profile}`,
      ], {
        stdio: 'inherit',
        windowsHide: true,
      })
      const timeout = setTimeout(() => {
        child.kill()
        reject(new Error(`LLM runtime smoke timed out: ${executable}`))
      }, 30_000)
      child.once('error', (error) => {
        clearTimeout(timeout)
        reject(error)
      })
      child.once('exit', (code) => {
        clearTimeout(timeout)
        if (code === 0) resolvePromise()
        else reject(new Error(`LLM runtime smoke failed with exit code ${code}: ${executable}`))
      })
    })
  } finally {
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}

await runSmoke(unpackedExecutable)
if (verifyPortable) {
  if (!existsSync(portableExecutable)) throw new Error(`Portable artifact missing: ${portableExecutable}`)
  await runSmoke(portableExecutable)
}

console.log(`Packaged LLM runtime verified${verifyPortable ? ' (unpacked + portable)' : ''}.`)
