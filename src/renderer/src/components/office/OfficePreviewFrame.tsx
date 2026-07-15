import type { OfficeErrorCode, OfficecliManualInstallGuidance } from '../../../../shared/office'

const ERROR_COPY: Record<OfficeErrorCode, string> = {
  NOT_INSTALLED: 'OfficeCLI 未安装。请手动安装项目锁定版本后重试。',
  INCOMPATIBLE: 'OfficeCLI 版本不兼容。请手动安装项目锁定版本后重试。',
  TOO_MANY: '已打开过多预览，请关闭其他预览后重试。',
  START_FAILED: '预览启动失败，请重试或关闭此标签。',
  PORT_TIMEOUT: '预览服务未能及时就绪，请重试或关闭此标签。',
  NO_PORT: '没有可用的预览端口，请重试或关闭此标签。',
  IO: 'Office 文件暂时不可用，请检查文件后重试。',
  NOT_OFFICE: '该文件不是受支持的 Office 文档。',
  OUTSIDE_ROOT: '文件不在当前工作区内。',
  SCAN_LIMIT: '工作区 Office 文件过多，已停止扫描。',
  INVALID_REQUEST: '预览请求无效。',
  UNAUTHORIZED: '当前窗口无权打开此预览。',
  UNAVAILABLE: 'Office 预览当前不可用。',
}

export function buildOfficePreviewUrl(port: number | undefined): string | null {
  return Number.isInteger(port) && port! >= 1 && port! <= 65535 ? `http://127.0.0.1:${port}/` : null
}

interface Props {
  port?: number
  status: 'starting' | 'ready' | 'reloading' | 'error'
  errorCode?: OfficeErrorCode
  manualInstall?: OfficecliManualInstallGuidance
  onRetry: () => void
  onClose: () => void
}

export function getOfficeErrorCopy(errorCode: OfficeErrorCode, manualInstall?: OfficecliManualInstallGuidance): string {
  if ((errorCode === 'NOT_INSTALLED' || errorCode === 'INCOMPATIBLE') && manualInstall) {
    return `${ERROR_COPY[errorCode]} 目标版本：${manualInstall.targetVersion}。请按固定指引手动安装：${manualInstall.windows.join('；')}。发布地址：${manualInstall.release}`
  }
  return ERROR_COPY[errorCode]
}

export function OfficePreviewFrame({ port, status, errorCode, manualInstall, onRetry, onClose }: Props) {
  const src = buildOfficePreviewUrl(port)
  if (status === 'error' || !src) {
    if (status !== 'error') return <div className="flex h-full items-center justify-center text-xs text-[#777]">正在启动预览…</div>
    return <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center text-xs text-[#aaa]">
      <div>{getOfficeErrorCopy(errorCode ?? 'UNAVAILABLE', manualInstall)}</div>
      <div className="flex gap-2">
        <button className="rounded border border-white/10 px-2 py-1 hover:bg-white/5" onClick={onRetry}>重试</button>
        <button className="rounded border border-white/10 px-2 py-1 hover:bg-white/5" onClick={onClose}>关闭</button>
      </div>
    </div>
  }
  return <div className="relative h-full">
    {status === 'reloading' && <div className="absolute inset-x-0 top-0 z-10 bg-black/60 py-1 text-center text-[10px] text-[#aaa]">正在从磁盘重新加载…</div>}
    <iframe title="Office document preview" className="h-full w-full border-0 bg-white" src={src} sandbox="allow-scripts allow-same-origin" referrerPolicy="no-referrer" />
  </div>
}
