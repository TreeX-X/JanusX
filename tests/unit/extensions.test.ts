import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ExtensionRegistry, extensionRegistry } from '../../src/renderer/src/extensions/registry'
import type { ExtensionDefinition, ExtensionView } from '../../src/renderer/src/extensions/types'
import { openExtensionView } from '../../src/renderer/src/extensions/workbench'
import { getRightToolDefinitions } from '../../src/renderer/src/right-tools/registry'
import { reconcileRightToolPreferences } from '../../src/renderer/src/right-tools/state'
import { createExtensionPaneContent, getLeafPanes, retainWorkspacePaneContent } from '../../src/renderer/src/lib/workspace-pane'
import { useWorkspaceStore } from '../../src/renderer/src/stores/workspace'
import { useRightToolStore } from '../../src/renderer/src/stores/right-tools'

const component = () => null
vi.hoisted(() => {
  const values = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  } })
})
const view = (overrides: Partial<ExtensionView> = {}): ExtensionView => ({
  id: 'page', title: 'Page', location: 'workspace', scope: 'project', component, ...overrides,
})
const definition = (overrides: Partial<ExtensionDefinition> = {}): ExtensionDefinition => ({
  id: 'test.tools', views: [view()], ...overrides,
})

describe('trusted extension registry', () => {
  it('publishes stable snapshots and namespaced, ordered contributions', () => {
    const registry = new ExtensionRegistry()
    const empty = registry.getSnapshot()
    const listener = vi.fn()
    const unsubscribe = registry.subscribe(listener)
    expect(registry.getSnapshot()).toBe(empty)
    const unregister = registry.register(definition({ views: [view({ order: 2 }), view({ id: 'summary', order: 1 })] }))
    expect(registry.getSnapshot().map((item) => item.id)).toEqual(['extension:test.tools/summary', 'extension:test.tools/page'])
    expect(Object.isFrozen(registry.getSnapshot())).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    unregister()
    expect(registry.getSnapshot()).toEqual([])
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('rejects duplicate definitions and views without replacing a working extension', () => {
    const registry = new ExtensionRegistry()
    registry.register(definition())
    expect(() => registry.register(definition())).toThrow('Duplicate extension')
    expect(() => registry.register(definition({ id: 'other', views: [view(), view()] }))).toThrow('duplicate view')
    expect(registry.getSnapshot()).toHaveLength(1)
  })

  it.each(['', '../escape', 'Uppercase', 'with space', 'a/b'])('rejects invalid extension identity %j', (id) => {
    expect(() => new ExtensionRegistry().register(definition({ id }))).toThrow('Invalid extension id')
  })

  it.each([
    { id: 'bad/id' }, { title: ' ' }, { order: NaN },
    { location: 'bad' as 'workspace' }, { scope: 'bad' as 'project' },
    { launcher: 'bad' as 'tool-menu' }, { location: 'right' as const, launcher: 'tool-menu' as const },
  ])('rejects malformed view metadata %j', (overrides) => {
    expect(() => new ExtensionRegistry().register(definition({ views: [view(overrides)] }))).toThrow()
  })

  it('activates and disposes once per enable, including idempotent unregister', () => {
    const registry = new ExtensionRegistry()
    const dispose = vi.fn()
    const activate = vi.fn(() => dispose)
    const unregister = registry.register(definition({ activate }))
    registry.enable('test.tools')
    expect(activate).toHaveBeenCalledTimes(1)
    registry.disable('test.tools')
    registry.disable('test.tools')
    expect(dispose).toHaveBeenCalledTimes(1)
    registry.enable('test.tools')
    expect(activate).toHaveBeenCalledTimes(2)
    unregister()
    unregister()
    expect(dispose).toHaveBeenCalledTimes(2)
  })

  it('does not publish an extension whose activation fails and permits retry', () => {
    const registry = new ExtensionRegistry()
    expect(() => registry.register(definition({ activate: () => { throw new Error('setup') } }))).toThrow('setup')
    expect(registry.getSnapshot()).toEqual([])
    expect(() => registry.register(definition())).not.toThrow()
  })

  it('gives re-enabled views a fresh mount identity and isolates subscriber failures', () => {
    const registry = new ExtensionRegistry()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      registry.subscribe(() => { throw new Error('observer') })
      const listener = vi.fn()
      registry.subscribe(listener)
      registry.register(definition())
      const activation = registry.getSnapshot()[0].activationId
      registry.disable('test.tools')
      registry.enable('test.tools')
      expect(registry.getSnapshot()[0].activationId).not.toBe(activation)
      expect(listener).toHaveBeenCalledTimes(3)
    } finally { log.mockRestore() }
  })

  it('removes contributions and registration even when resource cleanup fails', () => {
    const registry = new ExtensionRegistry()
    const unregister = registry.register(definition({ activate: () => () => { throw new Error('cleanup') } }))
    expect(() => unregister()).toThrow('cleanup')
    expect(registry.getSnapshot()).toEqual([])
    expect(() => registry.register(definition())).not.toThrow()
    unregister() // stale disposer cannot unregister the replacement
    expect(registry.getSnapshot()).toHaveLength(1)
  })
})

describe('workbench extension integration', () => {
  let unregister: () => void
  const tabs = () => getLeafPanes(useWorkspaceStore.getState().paneTree).flatMap((leaf) => leaf.tabs)

  beforeEach(() => {
    useWorkspaceStore.setState({ activeWorkspaceId: 'one', workspaces: [], terminals: [],
      paneTree: null, focusedPaneId: null, focusedTabId: null, activeTerminalId: null, terminalSnapshots: {} })
    useRightToolStore.setState({ openToolIds: [], activeToolId: null })
    unregister = extensionRegistry.register(definition({ views: [
      view(), view({ id: 'global', scope: 'application' }), view({ id: 'summary', location: 'right' }),
    ] }))
  })
  afterEach(() => { unregister() })

  it('opens singleton center and right views without adding container branches', () => {
    expect(openExtensionView('extension:test.tools/page')).toBe(true)
    openExtensionView('extension:test.tools/page')
    expect(tabs()).toHaveLength(1)
    expect(openExtensionView('extension:test.tools/summary')).toBe(true)
    expect(useRightToolStore.getState().activeToolId).toBe('extension:test.tools/summary')
    expect(getRightToolDefinitions().find((item) => item.id === 'extension:test.tools/summary')?.title).toBe('Page')
  })

  it('isolates project tabs and restores them on return', () => {
    openExtensionView('extension:test.tools/page')
    const first = tabs()[0]
    useWorkspaceStore.getState().setActiveWorkspace('two')
    expect(tabs()).toEqual([])
    openExtensionView('extension:test.tools/page')
    expect(tabs()[0]).toMatchObject({ projectId: 'two' })
    expect(tabs()[0].id).not.toBe(first.id)
    useWorkspaceStore.getState().setActiveWorkspace('one')
    expect(tabs()).toEqual([first])
  })

  it('transfers one global view across projects and removes it from inactive snapshots', () => {
    openExtensionView('extension:test.tools/global')
    const global = tabs()[0]
    useWorkspaceStore.getState().setActiveWorkspace('two')
    expect(tabs()).toEqual([global])
    expect(useWorkspaceStore.getState().terminalSnapshots.one.paneTree).toBeNull()
    useWorkspaceStore.getState().setActiveWorkspace('one')
    expect(tabs()).toEqual([global])
    expect(useWorkspaceStore.getState().terminalSnapshots.two.paneTree).toBeNull()
  })

  it('requires a project for project views but permits a global view with no project', () => {
    useWorkspaceStore.setState({ activeWorkspaceId: null })
    expect(openExtensionView('extension:test.tools/page')).toBe(false)
    expect(openExtensionView('extension:test.tools/summary')).toBe(false)
    expect(openExtensionView('extension:test.tools/global')).toBe(true)
    expect(createExtensionPaneContent('extension:test.tools/page', null)).toBeNull()
  })

  it('preserves the selected project tab when a global tab transfers back', () => {
    openExtensionView('extension:test.tools/global')
    openExtensionView('extension:test.tools/page')
    const projectTab = useWorkspaceStore.getState().focusedTabId
    useWorkspaceStore.getState().setActiveWorkspace('two')
    useWorkspaceStore.getState().setActiveWorkspace('one')
    const state = useWorkspaceStore.getState()
    expect(state.focusedTabId).toBe(projectTab)
    expect(getLeafPanes(state.paneTree).find((leaf) => leaf.id === state.focusedPaneId)?.activeTabId).toBe(projectTab)
  })

  it('disabling cleans inactive snapshots and both positions; re-enabling starts closed', () => {
    openExtensionView('extension:test.tools/page')
    useWorkspaceStore.getState().setActiveWorkspace('two')
    openExtensionView('extension:test.tools/global')
    openExtensionView('extension:test.tools/summary')
    extensionRegistry.disable('test.tools')
    expect(tabs()).toEqual([])
    expect(useWorkspaceStore.getState().terminalSnapshots.one.paneTree).toBeNull()
    expect(useRightToolStore.getState().openToolIds).toEqual([])
    expect(openExtensionView('extension:test.tools/global')).toBe(false)
    extensionRegistry.enable('test.tools')
    expect(tabs()).toEqual([])
    expect(openExtensionView('extension:test.tools/page')).toBe(true)
  })

  it('drops stale views from restored snapshots and right-hand preferences', () => {
    openExtensionView('extension:test.tools/page')
    const tree = useWorkspaceStore.getState().paneTree
    extensionRegistry.disable('test.tools')
    expect(retainWorkspacePaneContent(tree, 'one')).toBeNull()
    expect(reconcileRightToolPreferences({ schemaVersion: 1,
      openToolIds: ['extension:test.tools/summary'], activeToolId: 'extension:test.tools/summary', panelWidth: 280,
    }).openToolIds).toEqual([])
  })
})
