export function installElectronApiFallback(): void {
  if (window.electron) return

  window.electron = {
    platform: inferPlatform(),
    workspace: {
      initialize: () => Promise.resolve({ loadState: 'no-workspace', workspaces: [], activeWorkspaceId: null }),
      list: () => Promise.resolve([]),
      load: () => Promise.reject(new Error('Electron workspace API is unavailable')),
      create: () => Promise.reject(new Error('Electron workspace API is unavailable')),
      update: () => Promise.reject(new Error('Electron workspace API is unavailable')),
      delete: () => Promise.resolve({ success: false }),
    },
    fileTree: {
      load: () => Promise.resolve([]),
      children: () => Promise.resolve([]),
      createFile: () => Promise.resolve({ success: false, error: 'Electron file tree API is unavailable' }),
      createDirectory: () => Promise.resolve({ success: false, error: 'Electron file tree API is unavailable' }),
      rename: () => Promise.resolve({ success: false, error: 'Electron file tree API is unavailable' }),
      delete: () => Promise.resolve({ success: false, error: 'Electron file tree API is unavailable' }),
      reveal: () => Promise.resolve({ success: false, error: 'Electron file tree API is unavailable' }),
      onChanged: () => () => {},
    },
    file: {
      read: () => Promise.resolve({ error: 'Electron file API is unavailable' }),
      save: () => Promise.resolve({ error: 'Electron file API is unavailable' }),
      readBinary: () => Promise.resolve({ error: 'Electron file API is unavailable' }),
      stat: () => Promise.resolve({ error: 'Electron file API is unavailable' }),
    },
    terminal: {
      warmup: () => Promise.resolve({ ok: true }),
      create: () => Promise.reject(new Error('Electron terminal API is unavailable')),
      replay: () => Promise.resolve({ data: '', seq: 0 }),
      kill: () => Promise.resolve({ success: true }),
      input: () => {},
      resize: () => {},
      submitLine: () => {},
      onData: () => () => {},
      onExit: () => () => {},
      onFocus: () => () => {},
    },
    project: {
      detect: () => unavailableProjectResult(),
      detectWithDetails: () => unavailableProjectResult(),
      readConfig: () => unavailableProjectResult(),
      writeConfig: () => unavailableProjectResult(),
      createDefaultConfig: () => unavailableProjectResult(),
      validateConfig: () => unavailableProjectResult(),
      run: () => unavailableProjectResult(),
      stop: () => unavailableProjectResult(),
      list: () => unavailableProjectResult(),
      get: () => unavailableProjectResult(),
      schemas: () => unavailableProjectResult(),
    },
    knowledge: {
      contracts: () => unavailableKnowledge(),
      bootstrap: () => unavailableKnowledge(),
      observe: () => unavailableKnowledge(),
      listObservations: () => unavailableKnowledge(),
      pruneObservations: () => unavailableKnowledge(),
      resolveObservationContent: () => unavailableKnowledge(),
      retentionStats: () => unavailableKnowledge(),
      listAudit: () => unavailableKnowledge(),
      auditStats: () => unavailableKnowledge(),
      extract: () => unavailableKnowledge(),
      listCandidates: () => unavailableKnowledge(),
      listGraphCandidates: () => unavailableKnowledge(),
      listWikiPatchCandidates: () => unavailableKnowledge(),
      rejectCandidate: () => unavailableKnowledge(),
      applyCandidate: () => unavailableKnowledge(),
      search: () => unavailableKnowledge(),
      listTruth: () => unavailableKnowledge(),
      revokeTruth: () => unavailableKnowledge(),
      listConflicts: () => unavailableKnowledge(),
      recordFeedback: () => unavailableKnowledge(),
      feedbackSummary: () => unavailableKnowledge(),
      context: () => unavailableKnowledge(),
      getSettings: () => unavailableKnowledge(),
      updateSettings: () => unavailableKnowledge(),
    },
    invoke: () => Promise.resolve(undefined),
    send: () => {},
    on: () => () => {},
    janusPersona: '',
  }
}

function unavailableProjectResult(): Promise<{ success: false; error: string }> {
  return Promise.resolve({ success: false, error: 'Electron project API is unavailable' })
}

function unavailableKnowledge(): Promise<never> {
  return Promise.reject(new Error('Electron knowledge API is unavailable'))
}

function inferPlatform(): NodeJS.Platform {
  const platform = navigator.platform.toLowerCase()
  if (platform.includes('win')) return 'win32'
  if (platform.includes('mac')) return 'darwin'
  if (platform.includes('linux')) return 'linux'
  return 'win32'
}
