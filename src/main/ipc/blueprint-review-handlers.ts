import { BrowserWindow, ipcMain } from 'electron'
import { z } from 'zod'
import { BLUEPRINT_REVIEW_CHANNELS as channels } from '../../shared/ipc/blueprint-review'
import { reviewContextSchema, reviewPathSchema } from '../../shared/blueprint-review'
import { blueprintReviewSettingsSchema } from '../../shared/blueprint-review-settings'
import { blueprintReviewRuntime, shutdownBlueprintReview } from '../blueprint/review/runtime'
import { appShutdown } from '../shutdown/AppShutdown'
import { checkReviewConfiguration } from '../blueprint/review/models'
import { getJevKey, setJevKey } from '../llm/jev-credentials'
import { noteMcpClients, probeNoteMcp } from '../blueprint/mcp/runtime'
import { NOTE_MCP_CLIENTS } from '../../shared/note-mcp'
import type { NoteReadResult } from '../../shared/blueprint-attention'

// Note: review owns suggestions; explicit repair handoff authorizes bounded Note edits — see .agents/notes/blueprint/maintenance/note-content-review.md
export function registerBlueprintReviewHandlers(): void {
  appShutdown.configure({ stopNoteReview: shutdownBlueprintReview })
  blueprintReviewRuntime().onActivityChanged(update => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send(channels.activityChanged, update)
    }
  })
  blueprintReviewRuntime().onResultsChanged(update => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send(channels.resultsChanged, update)
    }
  })
  const root = z.string().min(1)
  const id = z.string().uuid()
  const publishRead = (result: NoteReadResult) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send(channels.readChanged, result)
    }
  }
  ipcMain.handle(channels.markRead, async (_event, context, versions, bulk) => {
    const result = await blueprintReviewRuntime().reading.mark(reviewContextSchema.parse(context),
      z.array(z.object({ noteId: id, hash: z.string().regex(/^[a-f0-9]{64}$/), path: reviewPathSchema }).strict()).min(1).max(10000).parse(versions), z.boolean().parse(bulk))
    publishRead(result)
    return result
  })
  ipcMain.handle(channels.undoRead, async (_event, token) => {
    const result = await blueprintReviewRuntime().reading.revert(id.parse(token))
    publishRead(result)
    return result
  })
  ipcMain.handle(channels.repairPrepare, (_event, input) => blueprintReviewRuntime().repairs.prepare(input))
  ipcMain.handle(channels.repairDiff, (_event, repairId) => blueprintReviewRuntime().repairs.diff(id.parse(repairId)))
  ipcMain.handle(channels.repairRetryReview, (_event, repairId) => blueprintReviewRuntime().repairs.retryReview(id.parse(repairId)))
  ipcMain.handle(channels.repairUndo, async (_event, repairId) => {
    return blueprintReviewRuntime().repairs.undo(id.parse(repairId))
  })
  ipcMain.handle(channels.activityRead, (_event, path) => blueprintReviewRuntime().activityRead(root.parse(path)))
  ipcMain.handle(channels.read, (_event, path) => blueprintReviewRuntime().read(root.parse(path)))
  ipcMain.handle(channels.readSaved, (_event, path) => blueprintReviewRuntime().readSaved(root.parse(path)))
  ipcMain.handle(channels.run, (_event, path, noteId) => blueprintReviewRuntime().run(root.parse(path), id.parse(noteId)))
  ipcMain.handle(channels.cancel, (_event, path, noteId) => blueprintReviewRuntime().cancel(root.parse(path), id.parse(noteId)))
  ipcMain.handle(channels.close, (_event, context, noteId, revision, findingIds) => blueprintReviewRuntime().close(
    reviewContextSchema.parse(context), id.parse(noteId), z.number().int().nonnegative().parse(revision), z.array(id).min(1).max(200).parse(findingIds)))
  ipcMain.handle(channels.settingsGet, () => blueprintReviewRuntime().settings.read())
  ipcMain.handle(channels.settingsUpdate, async (_event, input) => {
    const runtime = blueprintReviewRuntime()
    const settings = await runtime.settings.update(blueprintReviewSettingsSchema.parse(input))
    runtime.configurationChanged(settings)
    await runtime.automatic.settingsChanged()
    return settings
  })
  ipcMain.handle(channels.configurationTest, async () => checkReviewConfiguration(await blueprintReviewRuntime().settings.read()))
  ipcMain.handle(channels.credentialStatus, async () => Boolean(await getJevKey()))
  ipcMain.handle(channels.credentialGet, () => getJevKey())
  ipcMain.handle(channels.credentialSet, (_event, key) => setJevKey(key))
  const clients = noteMcpClients()
  ipcMain.handle(channels.mcpStatus, () => clients.status())
  ipcMain.handle(channels.mcpChange, (_event, input) => clients.change(z.object({ client: z.enum(NOTE_MCP_CLIENTS), expectedHash: z.string().regex(/^[a-f0-9]{64}$/), action: z.enum(['import', 'remove']) }).strict().parse(input)))
  ipcMain.handle(channels.mcpProbe, () => probeNoteMcp())
}
