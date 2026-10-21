import { beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { parse } from 'acorn'
import { build } from 'esbuild'

const assets = 'apps/android-lab/app/build/generated/terminalAssets/terminal/'
beforeAll(() => execFileSync(process.execPath, ['scripts/android-lab/build-terminal.mjs']), 30000)

describe('bundled Android terminal WebView compatibility', () => {
  it('parses the complete shipped bundle with pre-optional-chaining syntax, including xterm', async () => {
    const oldBuild = await build({ entryPoints: ['apps/android-lab/terminal/terminal.ts'], bundle: true, format: 'iife', target: 'chrome80', write: false })
    expect(() => parse(oldBuild.outputFiles![0].text, { ecmaVersion: 2017 })).toThrow()
    const shipped = readFileSync(assets + 'terminal.js', 'utf8')
    expect(() => parse(shipped, { ecmaVersion: 2017 })).not.toThrow()
    // Browser-only xterm must not require the newer globalThis runtime API.
    expect(shipped).not.toMatch(/\bglobalThis\b/)
    expect(() => parse(readFileSync(assets + 'boot.js', 'utf8'), { ecmaVersion: 5 })).not.toThrow()
  })

  it('ignores icon failures, preserves the first script error and reports failure through the native bridge', () => {
    const listeners: Record<string, (event: any) => void> = {}
    const failures: string[] = []
    const loading = { hidden: true, textContent: '' }
    runInNewContext(readFileSync(assets + 'boot.js', 'utf8'), {
      window: { addEventListener: (type: string, handler: any) => { listeners[type] = handler }, AndroidTerminal: { failed: (text: string) => failures.push(text) } },
      document: { getElementById: () => loading },
    })
    listeners.error({ target: { tagName: 'IMG' } })
    expect(failures).toHaveLength(0)
    listeners.error({ message: "Uncaught SyntaxError: Unexpected token ?" })
    listeners.unhandledrejection({})
    expect(failures).toHaveLength(1)
    expect(loading.hidden).toBe(false)
    expect(loading.textContent).toContain('Unexpected token ?')
  })

  it('serves a bundled favicon with the offline-only policy', () => {
    const html = readFileSync(assets + 'index.html', 'utf8')
    expect(html).toContain('href="favicon.svg"')
    expect(html).toContain("img-src 'self'")
    expect(html).toContain("connect-src 'none'")
    expect(readFileSync(assets + 'favicon.svg', 'utf8')).toContain('<svg')
  })

  it('supplies microtasks when the older WebView lacks queueMicrotask', async () => {
    const window: any = { addEventListener() {}, AndroidTerminal: {} }
    runInNewContext(readFileSync(assets + 'boot.js', 'utf8'), { window, setTimeout })
    const order: string[] = []
    window.queueMicrotask(() => order.push('microtask'))
    order.push('synchronous')
    expect(order).toEqual(['synchronous'])
    await Promise.resolve()
    expect(order).toEqual(['synchronous', 'microtask'])
    expect(() => window.queueMicrotask(null)).toThrow('Expected a function')
  })
})
