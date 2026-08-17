import { type BrowserWindow } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join } from 'path'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function canReachRenderer(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(1_000) })
    return response.status < 500
  } catch {
    return false
  }
}

async function resolveDevRendererUrl(rawUrl: string): Promise<string> {
  // Electron-Vite sets this URL to the server belonging to the current
  // process. Never scan neighbouring ports: an older dev server may still be
  // alive there, which silently loads stale renderer code after a restart.
  const candidates = new Set<string>([rawUrl])
  const normalized = new URL(rawUrl)
  if (normalized.hostname === 'localhost') {
    normalized.hostname = '127.0.0.1'
    candidates.add(normalized.toString())
  }
  const urls = Array.from(candidates)
  for (let attempt = 0; attempt < 20; attempt++) {
    for (const candidate of urls) {
      if (await canReachRenderer(candidate)) return candidate
    }
    await delay(250)
  }
  return rawUrl
}

async function loadUrlWithRetry(window: BrowserWindow, url: string): Promise<void> {
  let lastError: unknown
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      await window.loadURL(url)
      return
    } catch (error) {
      lastError = error
      await delay(250)
    }
  }
  console.error(`Failed to load renderer URL after retries: ${url}`, lastError)
}

export async function loadRendererWindow(
  window: BrowserWindow,
  configureUrl?: (url: URL) => void,
  fileQuery?: Record<string, string>,
): Promise<void> {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    const url = new URL(await resolveDevRendererUrl(process.env['ELECTRON_RENDERER_URL']))
    configureUrl?.(url)
    await loadUrlWithRetry(window, url.toString())
    return
  }
  await window.loadFile(join(__dirname, '../../renderer/index.html'), fileQuery ? { query: fileQuery } : undefined)
}
