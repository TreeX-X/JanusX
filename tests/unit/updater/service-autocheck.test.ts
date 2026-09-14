import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.0-test', isPackaged: true },
}))

import { UpdateService } from '../../../src/main/updater/service'

/** 调度只验证计时器行为；check 本体被 mock，不触 electron-updater。 */
describe('UpdateService autoCheck scheduling', () => {
  const savedPortableDir = process.env.PORTABLE_EXECUTABLE_DIR

  beforeEach(() => {
    vi.useFakeTimers()
    // 本机 dev 环境自带 PORTABLE_EXECUTABLE_DIR，按 nsis 安装版隔离。
    delete process.env.PORTABLE_EXECUTABLE_DIR
  })

  afterEach(() => {
    if (savedPortableDir === undefined) delete process.env.PORTABLE_EXECUTABLE_DIR
    else process.env.PORTABLE_EXECUTABLE_DIR = savedPortableDir
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('默认开启：启动 30s 后首检', async () => {
    const service = new UpdateService()
    const check = vi.spyOn(service, 'checkForUpdates').mockResolvedValue(service.getState())
    service.startAutoCheck()
    await vi.advanceTimersByTimeAsync(29_999)
    expect(check).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(check).toHaveBeenCalledTimes(1)
    service.setAutoCheck(false)
  })

  it('关闭后不排期，打开后立即恢复排期', async () => {
    const service = new UpdateService()
    const check = vi.spyOn(service, 'checkForUpdates').mockResolvedValue(service.getState())
    service.setAutoCheck(false)
    service.startAutoCheck()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(check).not.toHaveBeenCalled()
    service.setAutoCheck(true)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(check).toHaveBeenCalledTimes(1)
    service.setAutoCheck(false)
  })

  it('运行中关闭即停 pending 计时器', async () => {
    const service = new UpdateService()
    const check = vi.spyOn(service, 'checkForUpdates').mockResolvedValue(service.getState())
    service.startAutoCheck()
    service.setAutoCheck(false)
    await vi.advanceTimersByTimeAsync(120_000)
    expect(check).not.toHaveBeenCalled()
  })
})
