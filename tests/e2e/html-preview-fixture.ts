import type { Page } from '@playwright/test'

/** Browser tests use deterministic assets; desktop and unit tests use the real server. */
export async function installHtmlPreviewFixture(page: Page) {
  const documents = new Map<string, { path: string; content: string }>()
  const state = { opened: 0, updated: 0, closed: 0 }
  const origin = 'http://127.0.0.1:41999'
  await page.exposeFunction('previewBridge', (action: string, payload: any) => {
    if (action === 'open') {
      const id = `fixture-${++state.opened}`
      const path = payload.documentPath.replace('C:/fixture/', '')
      documents.set(id, { path, content: payload.content })
      return { id, url: `${origin}/${id}/${path}` }
    }
    if (action === 'update') {
      documents.get(payload.id)!.content = payload.content
      state.updated++
    } else if (action === 'close') {
      documents.delete(payload.id)
      state.closed++
    }
  })
  await page.route(`${origin}/**`, async route => {
    const parts = new URL(route.request().url()).pathname.slice(1).split('/')
    const doc = documents.get(parts[0])
    if (doc && parts.slice(1).join('/') === doc.path) {
      await route.fulfill({ contentType: 'text/html', body: doc.content })
    } else if (parts.at(-1) === 'theme.css') {
      await route.fulfill({ contentType: 'text/css', body: 'html,body{margin:0} #page{background:rgb(18,52,86);color:white;width:100vw;height:100vh}' })
    } else if (parts.at(-1) === 'page.js') {
      await route.fulfill({ contentType: 'text/javascript', body: 'document.getElementById("page").dataset.ready="yes"' })
    } else await route.fulfill({ status: 404, body: '' })
  })
  return state
}
