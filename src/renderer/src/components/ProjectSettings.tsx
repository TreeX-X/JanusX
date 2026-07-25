/**
 * src/renderer/src/components/ProjectSettings.tsx
 *
 * 项目设置窗口
 * 集成：项目类型选择 + 配置表单 + JSON 编辑
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { ProjectType } from '@/types/project'
import type { LaunchConfig, DetectResult, ProjectTypeSchema } from '@/types/project'
import type { ApprovalRequest } from '../../../shared/ipc/agent-runtime'
import {
  createLatestRequestGuard,
  getProjectConfigDiff,
  getProjectValidationError,
  projectService,
} from '@/services/project'
import ProjectTypeSelector from './ProjectTypeSelector'
import QuickConfigForm from './ProjectConfigForm/QuickConfigForm'
import JsonEditor from './ProjectConfigForm/JsonEditor'
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
  const initializationGuardRef = useRef(createLatestRequestGuard())
  const saveGuardRef = useRef(createLatestRequestGuard())
  const applySessionRef = useRef<string | null>(null)
  const approvalUnsubscribeRef = useRef<(() => void) | null>(null)
  const configDiff = useMemo(() => getProjectConfigDiff(baselineConfig, candidateConfig ? config : null), [baselineConfig, candidateConfig, config])

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

  async function initializeSettings() {
    saveGuardRef.current.cancel()
    setSaving(false)
    await initializeSettingsForRequest(initializationGuardRef.current.begin())
  }

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

  // 保存配置
  const handleSave = useCallback(async () => {
    if (!config) return

    const isCurrent = saveGuardRef.current.begin()
    const configToSave = config
    setSaving(true)
    setError(null)

    try {
      // 验证配置
      const validation = await projectService.validateConfig(configToSave)
      if (!isCurrent()) return

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
      if (!isCurrent()) return
      setUnsavedChanges(false)
      setBaselineConfig(configToSave)
      onSave(configToSave)
    } catch (err) {
      if (!isCurrent()) return
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      if (isCurrent()) setSaving(false)
    }
  }, [config, configDiff, onSave, projectPath, projectRelativePath, workspaceId, workspaceRoot])

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
      {/* 左侧：项目类型选择器 */}
      <div className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <h3>项目类型</h3>
          {detection && (
            <span className={styles.confidence}>
              {Math.round(detection.confidence * 100)}% 置信度
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

        <div className={styles.sidebarActions}>
          <button onClick={initializeSettings} className={styles.actionBtn} title="重新检测项目">
            重新检测
          </button>
        </div>
      </div>

      {/* 中间：配置表单 */}
      <div className={styles.main}>
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
          {candidateConfig && (
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
      </div>

      {/* 右侧：操作按钮 */}
      <div className={styles.actions}>
        {pendingApproval ? (
          <>
            <button onClick={() => resolvePendingApproval(true)} className={styles.btnSave}>批准</button>
            <button onClick={() => resolvePendingApproval(false)} className={styles.btnCancel}>取消</button>
          </>
        ) : (
          <button
            onClick={handleSave}
            disabled={!unsavedChanges || saving}
            className={styles.btnSave}
          >
            {saving ? '等待审批...' : '保存'}
          </button>
        )}
        {onCancel && (
          <button onClick={onCancel} className={styles.btnCancel}>
            关闭
          </button>
        )}
      </div>
    </div>
  )
}

export default ProjectSettings
