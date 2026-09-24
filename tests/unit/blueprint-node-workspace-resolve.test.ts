/**
 * E0-4 discounted: projected-node workspace resolution by checkout path.
 * Pure helper — no stores, no IPC.
 */
import { describe, expect, it } from 'vitest'
import {
  nodeCheckoutPath,
  resolveNodeWorkspace,
  sameCheckoutPath,
} from '../../src/renderer/src/features/blueprint/resolveNodeWorkspace'
import type { BlueprintNode } from '../../src/renderer/src/services/blueprint'
import type { Workspace } from '../../src/renderer/src/types'

const node = (over: Partial<BlueprintNode> = {}): BlueprintNode =>
  ({ id: 'n', workspaceId: null, workspaceSnapshot: null, ...over }) as BlueprintNode

const ws = (over: Partial<Workspace> = {}): Workspace =>
  ({ id: 'ws-1', name: 'W', path: 'C:\\W\\R', ...over }) as Workspace

describe('sameCheckoutPath', () => {
  it('tolerates slash and case spelling variants', () => {
    expect(sameCheckoutPath('C:\\W\\R', 'c:/w/r')).toBe(true)
    expect(sameCheckoutPath('C:\\W\\R\\', 'C:/W/R')).toBe(true)
    expect(sameCheckoutPath('C:\\W\\R', 'C:\\W\\Other')).toBe(false)
  })
})

describe('resolveNodeWorkspace', () => {
  it('matches legacy nodes by registry id directly', () => {
    const n = node({ workspaceId: 'ws-1' })
    expect(resolveNodeWorkspace(n, null, [ws()])?.id).toBe('ws-1')
    expect(resolveNodeWorkspace(n, null, [ws({ id: 'other' })])).toBeNull()
  })

  it('resolves projected nodes through the owners map', () => {
    const n = node({ workspaceSnapshot: { name: 'R', path: 'C:\\W\\R' } })
    expect(resolveNodeWorkspace(n, 'C:\\W\\R', [ws()])?.id).toBe('ws-1')
  })

  it('falls back to the snapshot path when the owners map misses', () => {
    const n = node({ workspaceSnapshot: { name: 'R', path: 'c:/w/r' } })
    expect(resolveNodeWorkspace(n, null, [ws()])?.id).toBe('ws-1')
  })

  it('returns null when the checkout is not registered locally', () => {
    const n = node({ workspaceSnapshot: { name: 'R', path: 'C:\\W\\R' } })
    expect(resolveNodeWorkspace(n, 'C:\\W\\R', [ws({ id: 'other', path: 'D:\\Else' })])).toBeNull()
  })

  it('prefers the direct id match over path resolution', () => {
    const n = node({ workspaceId: 'ws-1', workspaceSnapshot: { name: 'R', path: 'D:\\Else' } })
    expect(resolveNodeWorkspace(n, 'D:\\Else', [ws(), ws({ id: 'ws-2', path: 'D:\\Else' })])?.id).toBe('ws-1')
  })
})

describe('nodeCheckoutPath', () => {
  it('prefers owners cwd, then snapshot, then null', () => {
    const n = node({ workspaceSnapshot: { name: 'R', path: 'C:\\W\\R' } })
    expect(nodeCheckoutPath(n, 'D:\\Owner')).toBe('D:\\Owner')
    expect(nodeCheckoutPath(n, null)).toBe('C:\\W\\R')
    expect(nodeCheckoutPath(node(), null)).toBeNull()
  })
})
