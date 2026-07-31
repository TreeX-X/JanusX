/**
 * src/renderer/src/components/ProjectSettings.tsx
 *
 * 项目设置窗口
 * 集成：项目类型选择 + 配置表单 + JSON 编辑
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Play, Save, ScanSearch, Square, SquareTerminal, TestTube2 } from 'lucide-react'
import { ProjectType } from '@/types/project'
import type { LaunchConfig, DetectResult, ProjectTypeSchema } from '@/types/project'
import type { ApprovalRequest } from '../../../shared/ipc/agent-runtime'
import type { ProjectTaskResult, RunningProjectSummary } from '../../../shared/ipc/project'
import {
  createLatestRequestGuard,
  getProjectConfigDiff,
  getProjectValidationError,
  projectService,
  startProjectPolling,
} from '@/services/project'
import { analyzeWorkspaceLaunch, type WorkspaceLaunchAnalysis } from '@/services/workspace-launch-assistant'
import ProjectTypeSelector from './ProjectTypeSelector'
import QuickConfigForm from './ProjectConfigForm/QuickConfigForm'
import JsonEditor from './ProjectConfigForm/JsonEditor'
import ProjectLaunchAssistant from './ProjectLaunchAssistant'
import styles from './ProjectSettings.module.css'

interface ProjectSettingsProps {
  projectPath: string
  workspaceId?: string
  workspaceRoot?: string
  projectRelativePath?: string
  candidateConfig?: LaunchConfig | null
  onSave: (config: LaunchConfig) => void
  onCancel?: () => void
}

/**
 * 项目设置 - 三栏式布局
 * 左：项目类型选择
 * 中：配置表单
 * 右：操作按钮
 */
export function ProjectSettings({
  projectPath,
  workspaceId,
  workspaceRoot,
  projectRelativePath = '',
  candidateConfig = null,
  onSave,
  onCancel,
}: ProjectSettingsProps) {
  const [detection, setDetection] = useState<DetectResult | null>(null)
  const [config, setConfig] = useState<LaunchConfig | null>(null)
  const [baselineConfig, setBaselineConfig] = useState<LaunchConfig | null>(null)
  const [schemas, setSchemas] = useState<ProjectTypeSchema[]>([])
  const [activeView, setActiveView] = useState<'quick' | 'advanced' | 'diff'>(candidateConfig ? 'diff' : 'quick')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null)
  const [unsavedChanges, setUnsavedChanges] = useState(false)
  const [analysis, setAnalysis] = useState<WorkspaceLaunchAnalysis | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [taskResult, setTaskResult] = useState<ProjectTaskResult | null>(null)
  const [runningProjects, setRunningProjects] = useState<RunningProjectSummary[]>([])
  const [executing, setExecuting] = useState<'test' | 'run' | 'stop' | null>(null)
  const initializationGuardRef = useRef(createLatestRequestGuard())
  const saveGuardRef = useRef(createLatestRequestGuard())
  const applySessionRef = useRef<string | null>(null)
  const approvalUnsubscribeRef = useRef<(() => void) | null>(null)
  const configDiff = useMemo(() => getProjectConfigDiff(baselineConfig, config), [baselineConfig, config])
  const suggestedTestScript = useMemo(() => ['test:unit', 'test', 'verify'].find((name) => detection?.availableScripts?.includes(name)), [detection])

  // 初始化：检测项目并创建默认配置
  useEffect(() => {
    saveGuardRef.current.cancel()
    setSaving(false)
    const isCurrent = initializationGuardRef.current.begin()
    void initializeSettingsForRequest(isCurrent)
    return () => {
      initializationGuardRef.current.cancel()
      saveGuardRef.current.cancel()
      approvalUnsubscribeRef.current?.()
      approvalUnsubscribeRef.current = null
      const sessionId = applySessionRef.current
      applySessionRef.current = null
      if (sessionId) void window.electron.agentRuntime.cancelSession(sessionId).catch(() => undefined)
    }
  }, [candidateConfig, projectPath])

  useEffect(() => startProjectPolling(async (isCurrent) => {
    try {
      const projects = await projectService.listByWorkspace(projectPath)
      if (isCurrent()) setRunningProjects(projects)
    } catch {
      // Runtime status is best-effort; command failures remain visible in the action handlers.
    }
  }, 2000), [projectPath])

  async function initializeSettingsForRequest(isCurrent: () => boolean) {
    setLoading(true)
    setError(null)

    try {
      // 1. 并行：详细检测项目 + 获取所有 Schema
      const [detectionResult, availableSchemas] = await Promise.all([
        projectService.detectWithDetails(projectPath),
        projectService.schemas(),
      ])
      if (!isCurrent()) return
      setDetection(detectionResult)
      setSchemas(availableSchemas)

      // 2. 尝试读取现有配置
      const existingConfig = await projectService.readConfig(projectPath)
      if (!isCurrent()) return
      setBaselineConfig(existingConfig)

      if (candidateConfig) {
        setConfig(structuredClone(candidateConfig))
        setUnsavedChanges(true)
        setActiveView('diff')
        return
      }

      if (existingConfig) {
        // 如果已有配置是自动检测的，但类型与当前检测不一致，用检测结果更新
        if (
          existingConfig.metadata?.autoDetected &&
          existingConfig.projectType !== detectionResult.type
        ) {
          const updatedConfig = {
            ...existingConfig,
            projectType: detectionResult.type,
            configurations: existingConfig.configurations.map((cfg) => ({
              ...cfg,
              type: detectionResult.type,
            })),
          }
          setConfig(updatedConfig)
          setUnsavedChanges(true)
        } else {
          setConfig(existingConfig)
        }
      } else {
        // 3. 创建默认配置
        const projectName = projectPath.split(/[/\\]/).pop() || 'app'
        const defaultConfig = await projectService.createDefaultConfig(
          projectPath,
          detectionResult.type,
          projectName,
        )
        if (!isCurrent()) return
        setConfig(defaultConfig)
      }
    } catch (err) {
      if (!isCurrent()) return
      setError(err instanceof Error ? err.message : 'Failed to initialize')
    } finally {
      if (isCurrent()) setLoading(false)
    }
  }

  // 处理项目类型切换
  const handleTypeChange = useCallback((newType: ProjectType) => {
    if (!config || !detection) return
    saveGuardRef.current.cancel()
    setSaving(false)

    const updatedConfig: LaunchConfig = {
      ...config,
      projectType: newType,
      configurations: config.configurations.map(cfg => ({
        ...cfg,
        type: newType,
      })),
    }

    setConfig(updatedConfig)
    setUnsavedChanges(true)
  }, [config, detection])

  // 处理配置更改
  const handleConfigChange = useCallback((updates: Partial<LaunchConfig>) => {
    if (!config) return
    saveGuardRef.current.cancel()
    setSaving(false)

    const updatedConfig: LaunchConfig = {
      ...config,
      ...updates,
    }

    setConfig(updatedConfig)
    setUnsavedChanges(true)
  }, [config])

  // 处理 JSON 编辑
  const handleJsonChange = useCallback((jsonString: string) => {
    saveGuardRef.current.cancel()
    setSaving(false)
    try {
      const parsed = JSON.parse(jsonString) as LaunchConfig
      setConfig(parsed)
      setUnsavedChanges(true)
      setError(null)
    } catch (err) {
      setError(`Invalid JSON: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }, [])

  const handleAssistantConfig = useCallback((nextConfig: LaunchConfig) => {
    setConfig(structuredClone(nextConfig))
    setUnsavedChanges(true)
    setActiveView('diff')
    setError(null)
  }, [])

  const handleAnalyze = useCallback(async (): Promise<WorkspaceLaunchAnalysis | null> => {
    if (!workspaceId || !workspaceRoot) {
      setError('当前工作区缺少可验证的 workspaceId，无法启动 Janus 分析。')
      return null
    }
    setAnalyzing(true)
    setError(null)
    try {
      const result = await analyzeWorkspaceLaunch({ workspaceId, workspaceRoot, projectRelativePath })
      setAnalysis(result)
      setDetection((current) => current ? {
        ...current,
        type: result.detection.candidates[0]?.type ?? result.detection.type,
        confidence: result.detection.candidates[0]?.confidence ?? result.detection.confidence,
        detectedFeatures: result.detection.candidates[0]?.evidence ?? result.detection.evidence,
        availableScripts: result.detection.availableScripts ?? current.availableScripts,
      } : current)
      if (!baselineConfig && !unsavedChanges) handleAssistantConfig(result.candidateConfig)
      return result
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '工作区分析失败')
      return null
    } finally {
      setAnalyzing(false)
    }
  }, [baselineConfig, handleAssistantConfig, projectRelativePath, unsavedChanges, workspaceId, workspaceRoot])

  // 保存配置
  const handleSave = useCallback(async (overrideConfig?: LaunchConfig): Promise<boolean> => {
    const configToSave = overrideConfig ?? config
    if (!configToSave) return false

    const isCurrent = saveGuardRef.current.begin()
    setSaving(true)
    setError(null)

    try {
      // 验证配置
      const validation = await projectService.validateConfig(configToSave)
      if (!isCurrent()) return false

      const validationError = getProjectValidationError(validation)
      if (validationError) throw new Error(validationError)

      if (workspaceId && workspaceRoot) {
        const session = await window.electron.agentRuntime.createSession({ workspaceId, workspaceRoot })
        applySessionRef.current = session.id
        const unsubscribe = window.electron.agentRuntime.onEvent((event) => {
          if (event.type === 'approval-requested' && event.request.sessionId === session.id) {
            setPendingApproval(event.request)
          }
        })
        approvalUnsubscribeRef.current = unsubscribe
        try {
          const targetPath = projectRelativePath
            ? `${projectRelativePath}/.janusX/janusX.launch.json`
            : '.janusX/janusX.launch.json'
          const result = await window.electron.agentRuntime.executeTool({
            sessionId: session.id,
            call: {
              toolName: 'project.apply-config',
              input: { workspaceId, path: projectRelativePath, config: configToSave },
              preview: {
                summary: `Apply launch configuration for ${configToSave.projectName}`,
                paths: [targetPath],
                detail: configDiff.slice(0, 30).map((entry) => `${entry.kind}: ${entry.path}`).join('\n'),
                truncated: configDiff.length > 30,
              },
            },
          })
          if (result.status !== 'completed') throw new Error(result.error || `Configuration apply ${result.status}`)
        } finally {
          unsubscribe()
          if (approvalUnsubscribeRef.current === unsubscribe) approvalUnsubscribeRef.current = null
          setPendingApproval(null)
          if (applySessionRef.current === session.id) applySessionRef.current = null
          await window.electron.agentRuntime.cancelSession(session.id).catch(() => undefined)
        }
      } else {
        await projectService.writeConfig(projectPath, configToSave)
      }
      if (!isCurrent()) return false
      setUnsavedChanges(false)
      setBaselineConfig(configToSave)
      setConfig(configToSave)
      onSave(configToSave)
      return true
    } catch (err) {
      if (!isCurrent()) return false
      setError(err instanceof Error ? err.message : 'Failed to save')
      return false
    } finally {
      if (isCurrent()) setSaving(false)
    }
  }, [config, configDiff, onSave, projectPath, projectRelativePath, workspaceId, workspaceRoot])

  const handleTest = useCallback(async (script?: string) => {
    setExecuting('test')
    setError(null)
    try {
      const result = await projectService.test(projectPath, script ?? suggestedTestScript)
      setTaskResult(result)
      if (result.exitCode !== 0 || result.timedOut) throw new Error(`${result.command} 未通过${result.timedOut ? '（超时）' : `（退出码 ${result.exitCode}）`}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '测试执行失败')
    } finally {
      setExecuting(null)
    }
  }, [projectPath, suggestedTestScript])

  const handleRun = useCallback(async (overrideConfig?: LaunchConfig) => {
    const configToRun = overrideConfig ?? config
    if (!configToRun) return
    if (!overrideConfig && unsavedChanges && !await handleSave()) return
    setExecuting('run')
    setError(null)
    try {
      await projectService.start(projectPath, configToRun.configurations[0]?.name)
      setRunningProjects(await projectService.listByWorkspace(projectPath))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '项目启动失败')
    } finally {
      setExecuting(null)
    }
  }, [config, handleSave, projectPath, unsavedChanges])

  const handleStop = useCallback(async () => {
    if (runningProjects.length === 0) return
    setExecuting('stop')
    setError(null)
    try {
      await Promise.all(runningProjects.map((project) => projectService.stop(project.id)))
      setRunningProjects([])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '项目停止失败')
      setRunningProjects(await projectService.listByWorkspace(projectPath).catch(() => []))
    } finally {
      setExecuting(null)
    }
  }, [projectPath, runningProjects])

  const resolvePendingApproval = useCallback((approved: boolean) => {
    if (!pendingApproval) return
    void window.electron.agentRuntime.resolveApproval({
      approvalId: pendingApproval.id,
      approved,
      workspaceId: pendingApproval.workspaceId,
      sessionId: pendingApproval.sessionId,
      correlationId: pendingApproval.correlationId,
      toolName: pendingApproval.toolName,
      actionRisk: pendingApproval.actionRisk,
    })
  }, [pendingApproval])

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <p>加载配置...</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <nav className={styles.sidebar} aria-label="项目类型">
        <div className={styles.sidebarHeader}>
          <h3>运行类型</h3>
          {detection && (
            <span className={styles.confidence}>
              {Math.round(detection.confidence * 100)}%
            </span>
          )}
        </div>

        {detection && (
          <ProjectTypeSelector
            schemas={schemas}
            selectedType={config?.projectType || ProjectType.Unknown}
            detectedType={detection.type}
            onChange={handleTypeChange}
          />
        )}

      </nav>

      <main className={styles.main}>
        <div className={styles.contextBar}>
          <div>
            <strong>{config?.projectName || projectPath.split(/[/\\]/).pop()}</strong>
            <span>{detection?.detectedFeatures.join(' · ') || '等待项目证据'}</span>
          </div>
          <div className={styles.contextMeta}>
            {suggestedTestScript && <code>{suggestedTestScript}</code>}
            {runningProjects.length > 0 && <span className={styles.runningState}>{runningProjects.length} 个进程运行中</span>}
          </div>
        </div>
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeView === 'quick' ? styles.tabActive : ''}`}
            onClick={() => setActiveView('quick')}
          >
            快速配置
          </button>
          <button
            className={`${styles.tab} ${activeView === 'advanced' ? styles.tabActive : ''}`}
            onClick={() => setActiveView('advanced')}
          >
            高级编辑
          </button>
          {configDiff.length > 0 && (
            <button
              className={`${styles.tab} ${activeView === 'diff' ? styles.tabActive : ''}`}
              onClick={() => setActiveView('diff')}
            >
              配置差异 <span className={styles.diffCount}>{configDiff.length}</span>
            </button>
          )}
        </div>

        <div className={styles.formContainer}>
          {activeView === 'advanced' ? (
            <JsonEditor value={JSON.stringify(config, null, 2)} onChange={handleJsonChange} />
          ) : activeView === 'diff' ? (
            <div className={styles.diffList} aria-label="Project configuration changes">
              {configDiff.length === 0 ? (
                <div className={styles.diffEmpty}>配置与当前版本一致</div>
              ) : configDiff.map((entry) => (
                <div key={entry.path} className={styles.diffRow} data-kind={entry.kind}>
                  <div className={styles.diffPath}><span>{entry.kind}</span>{entry.path}</div>
                  {entry.before !== undefined && <div className={styles.diffBefore}>- {entry.before}</div>}
                  {entry.after !== undefined && <div className={styles.diffAfter}>+ {entry.after}</div>}
                </div>
              ))}
            </div>
          ) : (
            <QuickConfigForm
              config={config}
              schema={schemas.find(s => s.type === config?.projectType) || null}
              onChange={handleConfigChange}
            />
          )}
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}
        {pendingApproval ? (
          <div className={styles.approvalBar}>
            <span>Janus 请求写入运行配置</span>
            <button onClick={() => resolvePendingApproval(false)}>拒绝</button>
            <button onClick={() => resolvePendingApproval(true)} className={styles.approveButton}>批准</button>
          </div>
        ) : null}

        {taskResult && (
          <details className={styles.taskOutput} open={taskResult.exitCode !== 0}>
            <summary>
              <SquareTerminal size={13} />
              {taskResult.command}
              <span data-success={taskResult.exitCode === 0}>{taskResult.exitCode === 0 ? '通过' : `退出 ${taskResult.exitCode}`}</span>
            </summary>
            <pre>{taskResult.output.slice(-120).join('\n')}</pre>
          </details>
        )}

        <div className={styles.commandBar}>
          <button onClick={() => void handleAnalyze()} disabled={analyzing || executing !== null} title="读取工作区并更新分析">
            <ScanSearch size={14} /> {analyzing ? '分析中' : '分析'}
          </button>
          <button onClick={() => void handleTest()} disabled={executing !== null || !suggestedTestScript} title={suggestedTestScript ? `运行 ${suggestedTestScript}` : '未发现测试脚本'}>
            <TestTube2 size={14} /> {executing === 'test' ? '测试中' : '测试'}
          </button>
          <span className={styles.commandSpacer} />
          {onCancel && <button onClick={onCancel}>关闭</button>}
          {runningProjects.length > 0 && (
            <button onClick={() => void handleStop()} disabled={executing !== null} title="停止当前工作区进程">
              <Square size={13} /> {executing === 'stop' ? '停止中' : '停止'}
            </button>
          )}
          <button onClick={() => void handleSave()} disabled={!unsavedChanges || saving || executing !== null} title="保存运行配置">
            <Save size={14} /> {saving ? '等待审批' : '保存'}
          </button>
          <button className={styles.runButton} onClick={() => void handleRun()} disabled={saving || executing !== null || !config} title="启动当前配置">
            <Play size={14} /> {executing === 'run' ? '启动中' : '启动'}
          </button>
        </div>
      </main>

      <ProjectLaunchAssistant
        analysis={analysis}
        config={config}
        busy={analyzing || saving || executing !== null}
        runningProjects={runningProjects}
        onAnalyze={handleAnalyze}
        onConfig={handleAssistantConfig}
        onSave={handleSave}
        onTest={handleTest}
        onRun={handleRun}
        onStop={handleStop}
      />
    </div>
  )
}

export default ProjectSettings
