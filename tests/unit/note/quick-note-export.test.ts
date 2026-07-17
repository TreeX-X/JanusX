import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildHtmlDocument, exportNoteCard, mdToPayload, stripMarkdown } from '../../../src/renderer/src/components/note/quick-note-export'
import type { NoteCard } from '../../../src/renderer/src/stores/note'

const card: NoteCard = { id: '12345678-x', terminalId: 't', title: 'Release/Note', content: '# Title\n\n- item\n\n```ts\nconst x = 1\n```', createdAt: 1, updatedAt: 1 }

describe('quick note export', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { electron: { dialog: { saveFile: vi.fn() }, file: { save: vi.fn() } } },
    })
  })
  it('preserves markdown and strips common markers for text', () => {
    expect(mdToPayload(card.content, 'md')).toBe(card.content)
    expect(stripMarkdown(card.content)).toBe('Title\n\nitem\n\nconst x = 1')
  })
  it('builds standalone escaped html', () => {
    const html = buildHtmlDocument('# Hello <script>\n\n- one\n\n```ts\nconst x = 1\n```')
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('<meta charset="utf-8">')
    expect(html).toContain('<h1>Hello &lt;script&gt;</h1>')
    expect(html).toContain('<li>one</li>')
    expect(html).toContain('<pre><code>const x = 1\n</code></pre>')
  })
  it('uses dialog then positional file save and treats cancellation silently', async () => {
    const saveFile = vi.mocked(window.electron.dialog.saveFile)
    const save = vi.mocked(window.electron.file.save)
    saveFile.mockResolvedValueOnce({ canceled: false, filePath: 'C:/Release-Note.md' })
    save.mockResolvedValueOnce({ success: true })
    await expect(exportNoteCard(card, 'md')).resolves.toBe('saved')
    expect(saveFile).toHaveBeenCalledWith({ defaultName: 'Release-Note.md', extension: 'md' })
    expect(save).toHaveBeenCalledWith('C:/Release-Note.md', card.content)
    saveFile.mockReset().mockResolvedValueOnce({ canceled: true })
    save.mockReset()
    await expect(exportNoteCard(card, 'txt')).resolves.toBe('canceled')
    expect(saveFile).toHaveBeenCalledTimes(1)
    expect(save).not.toHaveBeenCalled()
    saveFile.mockReset().mockResolvedValueOnce({ canceled: false })
    await expect(exportNoteCard(card, 'html')).resolves.toBe('canceled')
    expect(saveFile).toHaveBeenCalledTimes(1)
    expect(save).not.toHaveBeenCalled()
  })
  it('surfaces save errors for the view to display', async () => {
    const saveFile = vi.mocked(window.electron.dialog.saveFile)
    const save = vi.mocked(window.electron.file.save)
    saveFile.mockResolvedValueOnce({ canceled: false, filePath: 'C:/Release-Note.txt' })
    save.mockResolvedValueOnce({ error: 'disk full' })
    await expect(exportNoteCard(card, 'txt')).rejects.toThrow('disk full')

    saveFile.mockReset().mockRejectedValueOnce(new Error('dialog unavailable'))
    await expect(exportNoteCard(card, 'html')).rejects.toThrow('dialog unavailable')
  })
})
