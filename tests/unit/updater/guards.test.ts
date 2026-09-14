import { describe, expect, it } from 'vitest'
import { isAutoUpdateSupported, resolveUnsupportedReason } from '../../../src/main/updater/guards'

describe('updater guards', () => {
  it('win32 安装版是唯一支持形态', () => {
    const runtime = { platform: 'win32', isPackaged: true, portableDir: undefined } as const
    expect(resolveUnsupportedReason({ ...runtime })).toBeNull()
    expect(isAutoUpdateSupported({ ...runtime })).toBe(true)
  })

  it('mac / linux 在 P0 降级', () => {
    for (const platform of ['darwin', 'linux'] as const) {
      expect(resolveUnsupportedReason({ platform, isPackaged: true, portableDir: undefined })).toBe('non-windows-p0')
      expect(isAutoUpdateSupported({ platform, isPackaged: true, portableDir: undefined })).toBe(false)
    }
  })

  it('开发模式与便携版降级，永不静默安装', () => {
    expect(
      resolveUnsupportedReason({ platform: 'win32', isPackaged: false, portableDir: undefined }),
    ).toBe('dev-mode')
    expect(
      resolveUnsupportedReason({ platform: 'win32', isPackaged: true, portableDir: 'D:\\JanusX' }),
    ).toBe('portable')
  })
})
