import { type BrowserWindow } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join } from 'path'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function buildDevRendererUrlCandidates(baseUrl: URL): string[] {
  const candidates = new Set<string>([baseUrl.toString()])
  const basePort = Number(baseUrl.port)
  if (!Number.isFinite(basePort) || basePort <= 0) return Array.from(candidates)
  for (let port = basePort; port <= basePort + 5; port++) {
    const candidate = new URL(baseUrl.toString())
    if (candidate.hostname === 'localhost') candidate.hostname = '127.0.0.1'
    candidate.port = String(port)
    candidate.pathname = '/'
    candidate.search = ''
    candidate.hash = ''
    candidates.add(candidate.toString())
  }
  return Array.from(candidates)
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
  const candidates = buildDevRendererUrlCandidates(new URL(rawUrl))
  for (let attempt = 0; attempt < 20; attempt++) {
    for (const candidate of candidates) {
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
