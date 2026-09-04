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
      move: () => Promise.resolve({ success: false, error: 'Electron file tree API is unavailable' }),
      delete: () => Promise.resolve({ success: false, error: 'Electron file tree API is unavailable' }),
      reveal: () => Promise.resolve({ success: false, error: 'Electron file tree API is unavailable' }),
      onChanged: () => () => {},
    },
    file: {
      read: () => Promise.resolve({ error: 'Electron file API is unavailable' }),
      save: () => Promise.resolve({ error: 'Electron file API is unavailable' }),
      readBinary: () => Promise.resolve({ error: 'Electron file API is unavailable' }),
      stat: () => Promise.resolve({ error: 'Electron file API is unavailable' }),
      sourceFiles: () => Promise.resolve({ files: [], truncated: false, error: 'Electron file API is unavailable' }),
    },
    languageService: {
      definition: () => Promise.resolve({
        target: null,
        error: { code: 'server-error', message: 'Electron language service API is unavailable' },
      }),
      installer: {
        status: () => Promise.resolve({ serviceId: 'clangd', state: 'not-installed', location: '' }),
        start: () => Promise.resolve({ serviceId: 'clangd', state: 'failed', location: '', error: 'Electron API unavailable' }),
        cancel: () => Promise.resolve({ serviceId: 'clangd', state: 'not-installed', location: '' }),
        remove: () => Promise.resolve({ serviceId: 'clangd', state: 'not-installed', location: '' }),
        onInstallerProgress: () => () => {},
      },
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
      onCreated: () => () => {},
      onExit: () => () => {},
      onFocus: () => () => {},
      onStatus: () => () => {},
      onTelemetry: () => () => {},
    },
    project: {
      detect: () => unavailableProjectResult(),
      detectWithDetails: () => unavailableProjectResult(),
      readConfig: () => unavailableProjectResult(),
      writeConfig: () => unavailableProjectResult(),
      createDefaultConfig: () => unavailableProjectResult(),
      validateConfig: () => unavailableProjectResult(),
      test: () => unavailableProjectResult(),
      run: () => unavailableProjectResult(),
      stop: () => unavailableProjectResult(),
      list: () => unavailableProjectResult(),
      get: () => unavailableProjectResult(),
      schemas: () => unavailableProjectResult(),
    },
    browser: {
      createSurface: unavailable,
      destroySurface: unavailable,
      popOut: unavailable,
      embed: unavailable,
      setBounds: unavailable,
      getState: () => Promise.resolve(null),
      openTab: unavailable,
      closeTab: unavailable,
      activateTab: unavailable,
      navigate: unavailable,
      goBack: unavailable,
      goForward: unavailable,
      reload: unavailable,
      onStateChanged: () => () => {},
      onAgentControlChanged: () => () => {},
    },
    knowledge: {
      contracts: () => unavailableKnowledge(),
      bootstrap: () => unavailableKnowledge(),
      observe: () => unavailableKnowledge(),
      listObservations: () => unavailableKnowledge(),
      pruneObservations: () => unavailableKnowledge(),
      autoPruneObservations: () => unavailableKnowledge(),
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
      diagnostics: () => unavailableKnowledge(),
      getSettings: () => unavailableKnowledge(),
      updateSettings: () => unavailableKnowledge(),
    },
    janus: {
      listBlueprints: () => unavailableJanus(),
      listBlueprintSummaries: () => unavailableJanus(),
      loadBlueprint: () => unavailableJanus(),
      createBlueprint: () => unavailableJanus(),
      updateBlueprint: () => unavailableJanus(),
      deleteBlueprint: () => unavailableJanus(),
      createNode: () => unavailableJanus(),
      updateNode: () => unavailableJanus(),
      deleteNode: () => unavailableJanus(),
      replaceNodeFeatures: () => unavailableJanus(),
      addNodeFeature: () => unavailableJanus(),
      updateNodeFeature: () => unavailableJanus(),
      deleteNodeFeature: () => unavailableJanus(),
      focusNode: () => unavailableJanus(),
      bindTerminal: () => unavailableJanus(),
      analyze: () => unavailableJanus(),
      applyAnalysisPatch: () => unavailableJanus(),
      listAnalyses: () => unavailableJanus(),
      applyAnalysis: () => unavailableJanus(),
      listRequirementCandidates: () => unavailableJanus(),
      acceptRequirementCandidate: () => unavailableJanus(),
      rejectRequirementCandidate: () => unavailableJanus(),
      acceptDiscovered: () => unavailableJanus(),
      listMaintenanceTasks: () => unavailableJanus(),
      listMaintenanceAudits: () => unavailableJanus(),
      startMaintenanceTask: () => unavailableJanus(),
      sendMaintenanceMessage: () => unavailableJanus(),
      generateMaintenanceProposal: () => unavailableJanus(),
      applyMaintenanceChangeSet: () => unavailableJanus(),
      cancelMaintenanceTask: () => unavailableJanus(),
      completeMaintenanceTask: () => unavailableJanus(),
      prepareMaintenanceUndo: () => unavailableJanus(),
      applyMaintenanceUndo: () => unavailableJanus(),
      onAnalysisResult: () => () => {},
      onDiscovered: () => () => {},
      onMaintenanceTask: () => () => {},
    },
    office: {
      detect: unavailable, listFiles: unavailable, startPreview: unavailable, stopPreview: unavailable,
      reloadPreview: unavailable, buildPrompt: unavailable, installerStatus: unavailable,
      installerStart: unavailable, installerCancel: unavailable, installerRemove: unavailable,
      onInstallerProgress: () => () => {}, onFilesChanged: () => () => {}, onWatchEvicted: () => () => {},
    },
    llm: {
      getProviders: unavailable, getRuntimeStatus: unavailable, saveProvider: unavailable, testConnection: unavailable,
      removeProvider: unavailable, setDefaultProvider: unavailable, listModels: unavailable,
      getModelCatalog: unavailable, refreshModelCatalog: unavailable, getAdapters: unavailable,
      getDefaultProvider: unavailable, chat: unavailable, startChatStream: () => {}, abortChat: unavailable,
      onDelta: () => () => {}, onDone: () => () => {}, onError: () => () => {}, onRecallTrace: () => () => {},
      onToolTrace: () => () => {}, onAgentEvent: () => () => {},
    },
    agent: {
      start: unavailable, cancel: unavailable, cancelAll: unavailable, listSessions: unavailable,
      onEvent: () => () => {}, onNotification: () => () => {}, onHookEvent: () => () => {},
    },
    agentRuntime: {
      createSession: unavailable, executeTool: unavailable, cancelSession: unavailable,
      resolveApproval: () => Promise.resolve(false), getSession: () => Promise.resolve(null),
      setApprovalMode: () => Promise.resolve(null),
      queryPolicyAudit: () => Promise.resolve([]),
      executeFunctionCall: unavailable, executePlannerStep: unavailable,
      onEvent: () => () => {},
    },
    checkpoint: {
      create: unavailable, finalize: unavailable, restore: unavailable, list: unavailable,
      diff: unavailable, diffAll: unavailable, delete: unavailable, clearAll: unavailable,
      onEvent: () => () => {}, onReady: () => () => {},
    },
    git: {
      status: unavailable, log: unavailable, stage: unavailable, unstage: unavailable,
      commit: unavailable, push: unavailable, pull: unavailable, discard: unavailable, commitChanges: unavailable, fileBaseline: unavailable,
    },
    notificationSettings: {
      get: unavailable,
      update: unavailable,
      testFeishu: unavailable,
      getFeishuControlStatus: unavailable,
    },
    agentSettings: {
      get: () => Promise.resolve({ approvalMode: 'per-action' as const }),
      update: () => Promise.resolve({ approvalMode: 'per-action' as const }),
    },
    subAgentRun: { list: unavailable, onUpdated: () => () => {}, onRemoved: () => () => {} },
    roundtable: { start: unavailable, advance: unavailable, end: unavailable, getState: unavailable, restore: unavailable, export: unavailable, onEvent: () => () => {} },
    dialog: { openDirectory: unavailable, saveFile: unavailable, showMessageBox: unavailable },
    window: {
      minimize: unavailable,
      maximize: unavailable,
      close: unavailable,
      openEditor: unavailable,
      editorReady: () => {},
      embedEditor: unavailable,
      setAlwaysOnTop: unavailable,
      onEditorEmbedded: () => () => {},
      onEditorRefresh: () => () => {},
    },
    system: { getDefaultShell: unavailable, getPlatform: unavailable, openVSCode: unavailable, getRuntimeTelemetry: unavailable, getLanguage: () => Promise.resolve(null), setLanguage: unavailable, onPrepareQuit: () => () => {} },
    desktopToast: { ready: () => {}, action: () => {}, onShow: () => () => {} },
    janusPersona: '',
  }
}

function unavailableProjectResult(): Promise<{ success: false; error: string }> {
  return Promise.resolve({ success: false, error: 'Electron project API is unavailable' })
}

function unavailableKnowledge(): Promise<never> {
  return Promise.reject(new Error('Electron knowledge API is unavailable'))
}

function unavailableJanus(): Promise<never> {
  return Promise.reject(new Error('Electron Janus API is unavailable'))
}

function unavailable(): Promise<never> {
  return Promise.reject(new Error('Electron API is unavailable'))
}

function inferPlatform(): NodeJS.Platform {
  const platform = navigator.platform.toLowerCase()
  if (platform.includes('win')) return 'win32'
  if (platform.includes('mac')) return 'darwin'
  if (platform.includes('linux')) return 'linux'
  return 'win32'
}
