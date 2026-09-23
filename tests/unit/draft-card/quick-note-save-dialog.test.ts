import { describe, expect, it, vi } from 'vitest'
vi.mock('electron', () => ({ app: { getPath: () => '' }, BrowserWindow: class {}, dialog: {}, ipcMain: {}, shell: {} }))
import { resolveSaveFileDialogOptions } from '../../../src/main/ipc/handlers'

describe('dialog:saveFile validation', () => {
  it.each([['md', 'Markdown'], ['txt', 'Plain Text'], ['html', 'HTML']] as const)('builds %s filters', (extension, name) => {
    expect(resolveSaveFileDialogOptions({ defaultName: `Note.${extension}`, extension })).toEqual({ defaultPath: `Note.${extension}`, filters: [{ name, extensions: [extension] }] })
  })
  it.each([null, {}, { defaultName: '', extension: 'md' }, { defaultName: 'x', extension: 'exe' }])('rejects invalid input', (input) => {
    expect(() => resolveSaveFileDialogOptions(input)).toThrow()
  })
})
