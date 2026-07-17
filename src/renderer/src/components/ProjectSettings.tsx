/**
 * src/renderer/src/components/ProjectSettings.tsx
 *
 * 项目设置窗口
 * 集成：项目类型选择 + 配置表单 + JSON 编辑
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { ProjectType } from '@/types/project'
import type { LaunchConfig, DetectResult, ProjectTypeSchema } from '@/types/project'
import {
  createLatestRequestGuard,
  getProjectValidationError,
  projectService,
} from '@/services/project'
import ProjectTypeSelector from './ProjectTypeSelector'
import QuickConfigForm from './ProjectConfigForm/QuickConfigForm'
import JsonEditor from './ProjectConfigForm/JsonEditor'
import styles from './ProjectSettings.module.css'

interface ProjectSettingsProps {
  projectPath: string
  onSave: (config: LaunchConfig) => void
  onCancel?: () => void
}

/**
 * 项目设置 - 三栏式布局
 * 左：项目类型选择
 * 中：配置表单
 * 右：操作按钮
 */
export function ProjectSettings({ projectPath, onSave, onCancel }: ProjectSettingsProps) {
  const [detection, setDetection] = useState<DetectResult | null>(null)
  const [config, setConfig] = useState<LaunchConfig | null>(null)
  const [schemas, setSchemas] = useState<ProjectTypeSchema[]>([])
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unsavedChanges, setUnsavedChanges] = useState(false)
  const initializationGuardRef = useRef(createLatestRequestGuard())
  const saveGuardRef = useRef(createLatestRequestGuard())

  // 初始化：检测项目并创建默认配置
  useEffect(() => {
    saveGuardRef.current.cancel()
    setSaving(false)
    const isCurrent = initializationGuardRef.current.begin()
    void initializeSettingsForRequest(isCurrent)
    return () => {
      initializationGuardRef.current.cancel()
      saveGuardRef.current.cancel()
    }
  }, [projectPath])

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

      // 保存配置
      await projectService.writeConfig(projectPath, configToSave)
      if (!isCurrent()) return
      setUnsavedChanges(false)
      onSave(configToSave)
    } catch (err) {
      if (!isCurrent()) return
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      if (isCurrent()) setSaving(false)
    }
  }, [config, projectPath, onSave])

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
            className={`${styles.tab} ${!showAdvanced ? styles.tabActive : ''}`}
            onClick={() => setShowAdvanced(false)}
          >
            快速配置
          </button>
          <button
            className={`${styles.tab} ${showAdvanced ? styles.tabActive : ''}`}
            onClick={() => setShowAdvanced(true)}
          >
            高级编辑
          </button>
        </div>

        <div className={styles.formContainer}>
          {showAdvanced ? (
            <JsonEditor value={JSON.stringify(config, null, 2)} onChange={handleJsonChange} />
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
        <button
          onClick={handleSave}
          disabled={!unsavedChanges || saving}
          className={styles.btnSave}
        >
          {saving ? '保存中...' : '保存'}
        </button>
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
