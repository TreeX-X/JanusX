/**
 * 主题 CSS 生成脚本：definition.ts（唯一事实源）→ themes.generated.css。
 * 用法：npm run theme:css [-- --check]（--check 仅校验不同步时报错，用于 CI）。
 * 通过 esbuild 将 TS 代码生成入口打包后执行，不污染源码。
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const entry = join(root, 'src', 'shared', 'theme', 'css-codegen.ts')
const outCss = join(root, 'src', 'renderer', 'src', 'styles', 'themes.generated.css')
const checkOnly = process.argv.includes('--check')

const dir = mkdtempSync(join(tmpdir(), 'janusx-theme-css-'))
try {
  const bundle = join(dir, 'css-codegen.mjs')
  execFileSync(
    process.execPath,
    [
      join(root, 'node_modules', 'esbuild', 'bin', 'esbuild'),
      entry,
      '--bundle',
      '--platform=node',
      '--format=esm',
      `--outfile=${bundle}`,
      '--log-level=error',
    ],
    { stdio: 'inherit' },
  )
  const mod = await import(pathToFileURL(bundle).href)
  const css = mod.renderThemeCss()
  if (typeof css !== 'string' || css.length === 0) {
    throw new Error('renderThemeCss() returned empty output')
  }
  if (!checkOnly) {
    writeFileSync(outCss, css)
  }
  console.log(`[theme:css] ${checkOnly ? 'checked' : 'wrote'} ${outCss} (${css.length} bytes)`)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
