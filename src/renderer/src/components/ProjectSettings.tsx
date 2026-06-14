/**
 * src/renderer/src/components/ProjectSettings.tsx
 *
 * 项目设置窗口
 * 集成：项目类型选择 + 配置表单 + JSON 编辑
 */

import { useState, useEffect, useCallback } from 'react'
import { ProjectType } from '@/types/project'
import type { LaunchConfig, DetectResult, ProjectTypeSchema } from '@/types/project'
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

  // 初始化：检测项目并创建默认配置
  useEffect(() => {
    initializeSettings()
  }, [projectPath])

  async function initializeSettings() {
    setLoading(true)
    setError(null)

    try {
      // 1. 并行：详细检测项目 + 获取所有 Schema
      const [detectionResult, schemasResult] = await Promise.all([
        window.electron.invoke('project:detect-with-details', projectPath) as Promise<any>,
        window.electron.invoke('project:schemas') as Promise<any>,
      ])

      if (!detectionResult.success) {
        throw new Error(detectionResult.error)
      }

      setDetection(detectionResult.data)

      if (schemasResult.success) {
        setSchemas(schemasResult.data)
      }

      // 2. 尝试读取现有配置
      const configResult = await window.electron.invoke(
        'project:config:read',
        projectPath
      ) as any

      if (configResult.success && configResult.data) {
        const existingConfig = configResult.data
        // 如果已有配置是自动检测的，但类型与当前检测不一致，用检测结果更新
        if (
          existingConfig.metadata?.autoDetected &&
          existingConfig.projectType !== detectionResult.data.type
        ) {
          const updatedConfig = {
            ...existingConfig,
            projectType: detectionResult.data.type,
            configurations: existingConfig.configurations.map((cfg: any) => ({
              ...cfg,
              type: detectionResult.data.type,
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
        const defaultResult = await window.electron.invoke(
          'project:config:create-default',
          projectPath,
          detectionResult.data.type,
          projectName
        ) as any

        if (defaultResult.success) {
          setConfig(defaultResult.data)
        } else {
          throw new Error(defaultResult.error)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize')
    } finally {
      setLoading(false)
    }
  }

  // 处理项目类型切换
  const handleTypeChange = useCallback((newType: ProjectType) => {
    if (!config || !detection) return

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

    const updatedConfig: LaunchConfig = {
      ...config,
      ...updates,
    }

    setConfig(updatedConfig)
    setUnsavedChanges(true)
  }, [config])

  // 处理 JSON 编辑
  const handleJsonChange = useCallback((jsonString: string) => {
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

    setSaving(true)
    setError(null)

    try {
      // 验证配置
      const validation = await window.electron.invoke(
        'project:config:validate',
        config
      ) as any

      if (!validation.success) {
        const errorMessages = validation.data.errors
          .map((e: any) => e.message)
          .join('; ')
        throw new Error(`Validation failed: ${errorMessages}`)
      }

      // 保存配置
      const saveResult = await window.electron.invoke(
        'project:config:write',
        projectPath,
        config
      ) as any

      if (saveResult.success) {
        setUnsavedChanges(false)
        onSave(config)
      } else {
        throw new Error(saveResult.error)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
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
