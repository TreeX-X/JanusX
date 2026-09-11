import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ToolCallCard } from '../../src/renderer/src/components/janus/ToolCallCard'

vi.mock('../../src/renderer/src/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

describe('streaming tool card', () => {
  it.each(['running', 'failed', 'completed'])('shows output for %s tools and escapes markup', (status) => {
    const html = renderToStaticMarkup(createElement(ToolCallCard, {
      entry: { toolName: 'command_run', workspaceId: '', status, summary: '', resultDigest: '<script>alert(1)</script>' },
      workspaceNames: new Map(), defaultExpanded: true,
    }))
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>')
  })
})
