import type { OfficeErrorCode, OfficecliManualInstallGuidance } from '../../../../shared/office'
import { useI18n } from '@/i18n/useI18n'
import type { TFunction } from 'i18next'

const ERROR_KEY: Record<OfficeErrorCode, string> = {
  NOT_INSTALLED: 'editor:office.errorNotInstalled',
  INCOMPATIBLE: 'editor:office.errorIncompatible',
  TOO_MANY: 'editor:office.errorTooMany',
  START_FAILED: 'editor:office.errorStartFailed',
  PORT_TIMEOUT: 'editor:office.errorPortTimeout',
  NO_PORT: 'editor:office.errorNoPort',
  IO: 'editor:office.errorIo',
  NOT_OFFICE: 'editor:office.errorNotOffice',
  OUTSIDE_ROOT: 'editor:office.errorOutsideRoot',
  SCAN_LIMIT: 'editor:office.errorScanLimit',
  INVALID_REQUEST: 'editor:office.errorInvalidRequest',
  UNAUTHORIZED: 'editor:office.errorUnauthorized',
  UNAVAILABLE: 'editor:office.errorUnavailable',
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

export function getOfficeErrorCopy(errorCode: OfficeErrorCode, manualInstall?: OfficecliManualInstallGuidance, t?: TFunction): string {
  const baseCopy = t ? t(ERROR_KEY[errorCode]) : ERROR_KEY[errorCode]
  if ((errorCode === 'NOT_INSTALLED' || errorCode === 'INCOMPATIBLE') && manualInstall) {
    const suffix = t
      ? t('editor:office.manualInstallSuffix', {
          version: manualInstall.targetVersion,
          windows: manualInstall.windows.join('；'),
          release: manualInstall.release,
        })
      : ` 目标版本：${manualInstall.targetVersion}。请按固定指引手动安装：${manualInstall.windows.join('；')}。发布地址：${manualInstall.release}`
    return `${baseCopy}${suffix}`
  }
  return baseCopy
}

export function OfficePreviewFrame({ port, status, errorCode, manualInstall, onRetry, onClose }: Props) {
  const { t } = useI18n('editor')
  const src = buildOfficePreviewUrl(port)
  if (status === 'error' || !src) {
    if (status !== 'error') return <div className="flex h-full items-center justify-center text-xs text-[#777]">{t('editor:office.startingPreview')}</div>
    return <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center text-xs text-[#aaa]">
      <div>{getOfficeErrorCopy(errorCode ?? 'UNAVAILABLE', manualInstall, t)}</div>
      <div className="flex gap-2">
        <button className="rounded border border-white/10 px-2 py-1 hover:bg-white/5" onClick={onRetry}>{t('editor:office.retry')}</button>
        <button className="rounded border border-white/10 px-2 py-1 hover:bg-white/5" onClick={onClose}>{t('editor:office.close')}</button>
      </div>
    </div>
  }
  return <div className="relative h-full">
    {status === 'reloading' && <div className="absolute inset-x-0 top-0 z-10 bg-black/60 py-1 text-center text-[10px] text-[#aaa]">{t('editor:office.reloading')}</div>}
    <iframe title={t('editor:office.iframeTitle')} className="h-full w-full border-0 bg-white" src={src} sandbox="allow-scripts allow-same-origin" referrerPolicy="no-referrer" />
  </div>
}
