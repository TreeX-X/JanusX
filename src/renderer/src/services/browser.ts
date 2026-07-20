import type { BrowserBounds, BrowserCarrier } from '../../../shared/ipc/browser'

/*-- browser 域 typed client：所有渲染层对 window.electron.browser 的访问收敛于此 --*/

export function createBrowserSurface(surfaceId: string, carrier: BrowserCarrier, url?: string) {
  return window.electron.browser.createSurface({ surfaceId, carrier, url })
}

export function destroyBrowserSurface(surfaceId: string) {
  return window.electron.browser.destroySurface(surfaceId)
}

export function popOutBrowserSurface(surfaceId: string) {
  return window.electron.browser.popOut(surfaceId)
}

export function embedBrowserSurface(surfaceId: string) {
  return window.electron.browser.embed(surfaceId)
}

export function setBrowserSurfaceBounds(surfaceId: string, bounds: BrowserBounds) {
  return window.electron.browser.setBounds(surfaceId, bounds)
}

export function getBrowserSurfaceState(surfaceId: string) {
  return window.electron.browser.getState(surfaceId)
}

export function openBrowserTab(surfaceId: string, url?: string) {
  return window.electron.browser.openTab(surfaceId, url)
}

export function closeBrowserTab(surfaceId: string, tabId: string) {
  return window.electron.browser.closeTab(surfaceId, tabId)
}

export function activateBrowserTab(surfaceId: string, tabId: string) {
  return window.electron.browser.activateTab(surfaceId, tabId)
}

export function navigateBrowserTab(surfaceId: string, tabId: string, url: string) {
  return window.electron.browser.navigate(surfaceId, tabId, url)
}

export function browserTabGoBack(surfaceId: string, tabId: string) {
  return window.electron.browser.goBack(surfaceId, tabId)
}

export function browserTabGoForward(surfaceId: string, tabId: string) {
  return window.electron.browser.goForward(surfaceId, tabId)
}

export function reloadBrowserTab(surfaceId: string, tabId: string) {
  return window.electron.browser.reload(surfaceId, tabId)
}
