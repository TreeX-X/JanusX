import { useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { Workspace, CLIConfig } from '@/types'

interface PresetCommand {
  id: string
  name: string
  engine: string
  command: string
  isDefault?: boolean
}

interface EnvVar {
  key: string
  value: string
}

interface WsConfigModalProps {
  workspace: Workspace
  onClose: () => void
}

const DEFAULT_COMMANDS: PresetCommand[] = [
  { id: '1', name: 'Dev Server', engine: 'pnpm', command: 'run dev', isDefault: true },
  { id: '2', name: 'Build', engine: 'pnpm', command: 'run build' },
]

const DEFAULT_ENV: EnvVar[] = [
  { key: 'PORT', value: '5173' },
]

function detectProjectType(wsPath: string): string {
  // Simple heuristic based on path name
  const lower = wsPath.toLowerCase()
  if (lower.includes('next')) return 'nextjs'
  if (lower.includes('rust') || lower.includes('cargo')) return 'rust'
  return 'vite'
}

function detectEngine(wsPath: string): string {
  return 'pnpm'
}

export function WsConfigModal({ workspace, onClose }: WsConfigModalProps) {
  const [projectType, setProjectType] = useState(() => detectProjectType(workspace.path))
  const [engine, setEngine] = useState(() => detectEngine(workspace.path))
  const [commands, setCommands] = useState<PresetCommand[]>(DEFAULT_COMMANDS)
  const [envVars, setEnvVars] = useState<EnvVar[]>(DEFAULT_ENV)

  const handleAddCommand = useCallback(() => {
    const newId = String(Date.now())
    setCommands((prev) => [
      ...prev,
      { id: newId, name: 'New Command', engine: 'pnpm', command: '' },
    ])
  }, [])

  const handleRemoveCommand = useCallback((id: string) => {
    setCommands((prev) => prev.filter((c) => c.id !== id))
  }, [])

  const handleCommandChange = useCallback((id: string, field: 'name' | 'engine' | 'command', value: string) => {
    setCommands((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)),
    )
  }, [])

  const handleAddEnv = useCallback(() => {
    setEnvVars((prev) => [...prev, { key: '', value: '' }])
  }, [])

  const handleRemoveEnv = useCallback((index: number) => {
    setEnvVars((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleEnvChange = useCallback((index: number, field: 'key' | 'value', val: string) => {
    setEnvVars((prev) =>
      prev.map((e, i) => (i === index ? { ...e, [field]: val } : e)),
    )
  }, [])

  const handleReset = useCallback(() => {
    setProjectType(detectProjectType(workspace.path))
    setEngine(detectEngine(workspace.path))
    setCommands(DEFAULT_COMMANDS)
    setEnvVars(DEFAULT_ENV)
  }, [workspace.path])

  const handleSave = useCallback(() => {
    // Build CLIConfig from the form data
    const clis: CLIConfig[] = commands.map((cmd) => ({
      id: cmd.id,
      type: cmd.name,
      command: cmd.engine,
      args: cmd.command.split(/\s+/).filter(Boolean),
      env: envVars.reduce<Record<string, string>>((acc, { key, value }) => {
        if (key.trim()) acc[key.trim()] = value
        return acc
      }, {}),
    }))
    // TODO: persist to workspace store / IPC
    console.log('[WsConfigModal] save', { workspaceId: workspace.id, projectType, engine, clis, envVars })
    onClose()
  }, [commands, envVars, workspace.id, projectType, engine, onClose])

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(10px)',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div className="ws-config-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div
          className="flex justify-between items-center"
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div
            className="font-semibold flex items-center"
            style={{ fontSize: 13, color: '#fff', gap: 8 }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#d4d4d4" strokeWidth="2">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
            <span>工作区启动配置</span>
          </div>
          <button
            onClick={onClose}
            className="cursor-pointer transition-colors"
            style={{ color: '#666', fontSize: 18, background: 'none', border: 'none' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#ff7830' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#666' }}
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="ws-config-body">
          {/* Workspace Info */}
          <div className="ws-config-ws-info">
            <div className="ws-config-ws-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div>
              <div className="ws-config-ws-name">{workspace.name}</div>
              <div className="ws-config-ws-path">{workspace.path}</div>
            </div>
          </div>

          {/* Environment Detection */}
          <div className="ws-config-section">
            <div className="ws-config-label">环境探测</div>
            <div className="ws-config-row">
              <div className="ws-config-field">
                <div className="ws-config-field-label">类型</div>
                <select
                  className="ws-config-select"
                  value={projectType}
                  onChange={(e) => setProjectType(e.target.value)}
                >
                  <option value="vite">Vite</option>
                  <option value="nextjs">Next.js</option>
                  <option value="rust">Rust</option>
                </select>
              </div>
              <div className="ws-config-field">
                <div className="ws-config-field-label">引擎</div>
                <select
                  className="ws-config-select"
                  value={engine}
                  onChange={(e) => setEngine(e.target.value)}
                >
                  <option value="pnpm">pnpm</option>
                  <option value="npm">npm</option>
                </select>
              </div>
            </div>
            <div className="ws-config-detected">
              <span className="ws-config-detected-dot" />
              <span>已通过 package.json 自动映射配置模板</span>
            </div>
          </div>

          {/* Preset Commands */}
          <div className="ws-config-section">
            <div className="ws-config-label">预设命令</div>
            <div className="ws-config-cmds">
              {commands.map((cmd) => (
                <div className="ws-config-cmd" key={cmd.id}>
                  <div className="ws-config-cmd-head">
                    <span className="ws-config-cmd-icon">&gt;</span>
                    <input
                      className="ws-config-cmd-name"
                      value={cmd.name}
                      onChange={(e) => handleCommandChange(cmd.id, 'name', e.target.value)}
                    />
                    {cmd.isDefault && <span className="ws-config-cmd-default">Default</span>}
                    <button
                      className="ws-config-cmd-del"
                      onClick={() => handleRemoveCommand(cmd.id)}
                    >
                      &times;
                    </button>
                  </div>
                  <div className="ws-config-cmd-row">
                    <input
                      className="ws-config-cmd-input"
                      value={cmd.engine}
                      onChange={(e) => handleCommandChange(cmd.id, 'engine', e.target.value)}
                      style={{ flex: 0.4 }}
                    />
                    <input
                      className="ws-config-cmd-input"
                      value={cmd.command}
                      onChange={(e) => handleCommandChange(cmd.id, 'command', e.target.value)}
                    />
                  </div>
                </div>
              ))}
            </div>
            <button className="ws-config-add-cmd" onClick={handleAddCommand}>
              + 添加构建管线
            </button>
          </div>

          {/* Environment Variables */}
          <div className="ws-config-section">
            <div className="ws-config-label">
              环境变量 <span style={{ fontWeight: 400, color: '#555' }}>(ENV)</span>
            </div>
            {envVars.map((env, index) => (
              <div className="ws-config-env-row" key={index}>
                <input
                  className="ws-config-env-input"
                  placeholder="KEY"
                  value={env.key}
                  onChange={(e) => handleEnvChange(index, 'key', e.target.value)}
                  style={{ flex: 0.35 }}
                />
                <input
                  className="ws-config-env-input"
                  placeholder="value"
                  value={env.value}
                  onChange={(e) => handleEnvChange(index, 'value', e.target.value)}
                />
                <button
                  className="ws-config-cmd-del"
                  onClick={() => handleRemoveEnv(index)}
                >
                  &times;
                </button>
              </div>
            ))}
            <button className="ws-config-add-env" onClick={handleAddEnv}>
              + 注入变量
            </button>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex justify-between items-center"
          style={{
            padding: '12px 16px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <button
            onClick={handleReset}
            className="rounded cursor-pointer transition-colors"
            style={{
              height: 28,
              padding: '0 14px',
              fontSize: 11,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#999',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
              e.currentTarget.style.color = '#ccc'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
              e.currentTarget.style.color = '#999'
            }}
          >
            恢复预设
          </button>
          <div className="flex" style={{ gap: 8 }}>
            <button
              onClick={onClose}
              className="rounded cursor-pointer transition-colors"
              style={{
                height: 28,
                padding: '0 14px',
                fontSize: 11,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#999',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                e.currentTarget.style.color = '#ccc'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                e.currentTarget.style.color = '#999'
              }}
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="rounded cursor-pointer transition-colors"
              style={{
                height: 28,
                padding: '0 14px',
                fontSize: 11,
                background: '#ff7830',
                border: '1px solid #ff7830',
                color: '#fff',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.filter = 'brightness(1.1)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.filter = 'none'
              }}
            >
              保存并应用
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
