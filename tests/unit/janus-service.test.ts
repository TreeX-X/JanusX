import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JanusAPI } from '../../src/shared/ipc/janus'
import type { Blueprint } from '../../src/shared/janus/types'

const janus = {
  listBlueprints: vi.fn(),
  applyAnalysisPatch: vi.fn(),
  onAnalysisResult: vi.fn(),
} as unknown as JanusAPI

let service: typeof import('../../src/renderer/src/services/blueprint')

beforeAll(async () => {
  vi.stubGlobal('window', { electron: { janus } })
  service = await import('../../src/renderer/src/services/blueprint')
})

describe('Blueprint renderer service', () => {
  beforeEach(() => vi.clearAllMocks())

  it('preserves raw command results through the sole typed client', async () => {
    const result = [{ id: 'bp-1' }] as Blueprint[]
    vi.mocked(janus.listBlueprints).mockResolvedValue(result)

    await expect(service.listBlueprints('C:\\repo')).resolves.toBe(result)
    expect(janus.listBlueprints).toHaveBeenCalledWith('C:\\repo')
  })

  it('exposes the existing analyzer apply-patch capability without transforming its payload', async () => {
    const payload = {
      workspacePath: 'C:\\repo',
      blueprintId: 'bp-1',
      nodeId: 'node-1',
      patch: { progress: 50 },
    }
    vi.mocked(janus.applyAnalysisPatch).mockResolvedValue(null)

    await expect(service.applyAnalysisPatch(payload)).resolves.toBeNull()
    expect(janus.applyAnalysisPatch).toHaveBeenCalledWith(payload)
  })

  it('returns the fixed API unsubscribe function unchanged', () => {
    const unsubscribe = vi.fn()
    const callback = vi.fn()
    vi.mocked(janus.onAnalysisResult).mockReturnValue(unsubscribe)

    expect(service.onAnalysisResult(callback)).toBe(unsubscribe)
    expect(janus.onAnalysisResult).toHaveBeenCalledWith(callback)
  })
})
