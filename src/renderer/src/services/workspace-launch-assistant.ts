import type { ToolResult } from '../../../shared/ipc/agent-runtime'
import { ProjectType, type LaunchConfig, type ValidationResult } from '../../../shared/ipc/project'
import { chatStream, type ChatMessage } from './llm'

const MANIFEST_PATTERN = /(^|\/)(package\.json|pyproject\.toml|cargo\.toml|go\.mod|cmakelists\.txt|readme(?:\.md)?)$/i
const MAX_CONTEXT_FILES = 5
const ROOT_CONTEXT_FILES = ['package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'CMakeLists.txt', 'README.md']
const ACTION_OPEN = '<janus-launch-action>'
const ACTION_CLOSE = '</janus-launch-action>'
const IGNORED_CONTEXT_DIRECTORIES = new Set([
  '.claude', '.codex', '.git', '.hybrid', '.janusx',
  'build', 'coverage', 'dist', 'node_modules', 'out', 'test-results',
])

function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '')
}

export function selectLaunchContextFiles(files: string[], projectPath = ''): string[] {
  const normalizedProjectPath = normalizeRelativePath(projectPath)
  const projectPrefix = normalizedProjectPath ? `${normalizedProjectPath}/` : ''

  return files
    .map(normalizeRelativePath)
    .filter((path) => !normalizedProjectPath || path.startsWith(projectPrefix))
    .filter((path) => {
      const relativePath = projectPrefix ? path.slice(projectPrefix.length) : path
      const directories = relativePath.split('/').slice(0, -1)
      return !directories.some((segment) => IGNORED_CONTEXT_DIRECTORIES.has(segment.toLowerCase()))
    })
    .sort((left, right) => {
      const leftRelative = projectPrefix ? left.slice(projectPrefix.length) : left
      const rightRelative = projectPrefix ? right.slice(projectPrefix.length) : right
      const depthDifference = leftRelative.split('/').length - rightRelative.split('/').length
      if (depthDifference !== 0) return depthDifference
      const leftReadme = /(^|\/)readme(?:\.md)?$/i.test(leftRelative) ? 1 : 0
      const rightReadme = /(^|\/)readme(?:\.md)?$/i.test(rightRelative) ? 1 : 0
      return leftReadme - rightReadme || left.localeCompare(right)
    })
}

export function redactWorkspaceExcerpt(content: string): string {
  return content
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|private[_-]?key)["']?\s*[:=]\s*)["']?[^"'\s,}]+/gi, '$1[REDACTED]')
    .replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/g, '$1[REDACTED]@')
}

export type LaunchAssistantAction = 'none' | 'save' | 'test' | 'run'

export interface WorkspaceLaunchAnalysis {
  workspaceId: string
  projectPath: string
  relativePath: string
  detection: {
    type: ProjectType
    confidence: number
    evidence: string[]
    availableScripts?: string[]
    candidates: Array<{ path: string; type: ProjectType; confidence: number; evidence: string[] }>
  }
  candidateConfig: LaunchConfig
  validation: ValidationResult
  files: string[]
  excerpts: Array<{ path: string; content: string }>
}

export interface LaunchAssistantResponse {
  message: string
  config: LaunchConfig | null
  action: LaunchAssistantAction
  testScript?: string
}

function completed<T>(result: ToolResult): T {
  if (result.status !== 'completed') throw new Error(result.error || `${result.toolName} ${result.status}`)
  return result.output as T
}

export async function analyzeWorkspaceLaunch(input: {
  workspaceId: string
  workspaceRoot: string
  projectRelativePath?: string
}): Promise<WorkspaceLaunchAnalysis> {
  const session = await window.electron.agentRuntime.createSession({
    workspaceId: input.workspaceId,
    workspaceRoot: input.workspaceRoot,
  })
  try {
    const relativePath = input.projectRelativePath ?? ''
    const listed = completed<{ entries: Array<{ path: string; type: 'file' | 'directory' }> }>(
      await window.electron.agentRuntime.executePlannerStep({
        sessionId: session.id,
        call: { toolName: 'workspace.list', input: { workspaceId: input.workspaceId, path: relativePath, depth: 3, maxEntries: 600 } },
      }),
    )
    const detection = completed<WorkspaceLaunchAnalysis['detection']>(
      await window.electron.agentRuntime.executePlannerStep({
        sessionId: session.id,
        call: { toolName: 'project.detect', input: { workspaceId: input.workspaceId, path: relativePath, depth: 3, maxDirectories: 100 } },
      }),
    )
    const selectedPath = input.projectRelativePath ?? detection.candidates[0]?.path ?? relativePath
    const generated = completed<{ config: LaunchConfig; validation: ValidationResult }>(
      await window.electron.agentRuntime.executePlannerStep({
        sessionId: session.id,
        call: {
          toolName: 'project.generate-config',
          input: { workspaceId: input.workspaceId, path: selectedPath, projectType: detection.candidates[0]?.type ?? detection.type },
        },
      }),
    )
    const listedFiles = listed.entries.filter((entry) => entry.type === 'file').map((entry) => entry.path)
    const files = selectLaunchContextFiles(listedFiles, selectedPath)
    const projectPrefix = selectedPath ? `${normalizeRelativePath(selectedPath)}/` : ''
    const contextFiles = [...new Set([
      ...ROOT_CONTEXT_FILES.map((path) => `${projectPrefix}${path}`),
      ...files.filter((path) => MANIFEST_PATTERN.test(path)),
    ])]
    const excerpts: Array<{ path: string; content: string }> = []
    for (const path of contextFiles) {
      if (excerpts.length >= MAX_CONTEXT_FILES) break
      try {
        const result = await window.electron.agentRuntime.executeFunctionCall({
          sessionId: session.id,
          call: { toolName: 'workspace.read', input: { workspaceId: input.workspaceId, path, maxBytes: 48 * 1024 } },
        })
        if (result.status !== 'completed') continue
        const read = result.output as { content: string }
        excerpts.push({ path, content: redactWorkspaceExcerpt(read.content) })
        if (!files.includes(path)) files.unshift(path)
      } catch {
        // Manifest excerpts improve the model context but are not required for detection.
      }
    }
    return {
      workspaceId: input.workspaceId,
      projectPath: selectedPath,
      relativePath: selectedPath,
      detection,
      candidateConfig: generated.config,
      validation: generated.validation,
      files,
      excerpts,
    }
  } finally {
    await window.electron.agentRuntime.cancelSession(session.id).catch(() => undefined)
  }
}

function redactConfig(config: LaunchConfig): LaunchConfig {
  return {
    ...config,
    configurations: config.configurations.map((item) => ({
      ...item,
      env: item.env ? Object.fromEntries(Object.keys(item.env).map((key) => [key, '[REDACTED]'])) : undefined,
    })),
  }
}

export function buildLaunchAssistantMessages(input: {
  request: string
  analysis: WorkspaceLaunchAnalysis
  config: LaunchConfig
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
}): ChatMessage[] {
  const context = {
    detection: input.analysis.detection,
    files: input.analysis.files.slice(0, 160),
    excerpts: input.analysis.excerpts,
    currentConfig: redactConfig(input.config),
  }
  return [
    {
      role: 'system',
      content: [
        'You are the JanusX workspace launch assistant.',
        'Analyze only the supplied workspace evidence. Do not invent files, scripts, ports, or commands.',
        'Write a concise user-facing answer first, then append one machine action block.',
        `The action block format is ${ACTION_OPEN}{"config":null,"action":"none","testScript":null}${ACTION_CLOSE}.`,
        'Never place user-facing prose inside the action block and never use Markdown fences around it.',
        'action must be one of none, save, test, run. Use an action only when the user explicitly asks for it.',
        'config in the action block must be the complete JanusX LaunchConfig or null. Preserve existing fields unless the user asks to change them.',
        'testScript must be a package script name visible in package.json, otherwise omit it.',
        'Always close the action block. Keep it compact.',
      ].join('\n'),
    },
    { role: 'system', content: `Workspace evidence:\n${JSON.stringify(context)}` },
    ...(input.history ?? []).slice(-8),
    { role: 'user', content: input.request },
  ]
}

export function parseLaunchAssistantResponse(raw: string): LaunchAssistantResponse {
  const trimmed = raw.trim()
  const blockStart = trimmed.indexOf(ACTION_OPEN)
  const blockEnd = blockStart >= 0 ? trimmed.indexOf(ACTION_CLOSE, blockStart + ACTION_OPEN.length) : -1
  const visibleMessage = blockStart >= 0 ? trimmed.slice(0, blockStart).trim() : ''
  const block = blockStart >= 0
    ? trimmed.slice(blockStart + ACTION_OPEN.length, blockEnd >= 0 ? blockEnd : undefined).trim()
    : trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim() ?? trimmed
  let candidate: Partial<LaunchAssistantResponse> = {}
  try {
    candidate = JSON.parse(block) as Partial<LaunchAssistantResponse>
  } catch {
    const legacyMessage = block.match(/"message"\s*:\s*"((?:\\.|[^"\\])*)"/)?.[1]
    if (legacyMessage) {
      try {
        candidate.message = JSON.parse(`"${legacyMessage}"`) as string
      } catch {
        candidate.message = legacyMessage
      }
    }
  }
  const action: LaunchAssistantAction = ['none', 'save', 'test', 'run'].includes(candidate.action ?? '')
    ? candidate.action as LaunchAssistantAction
    : 'none'
  const config = candidate.config && typeof candidate.config === 'object' && Array.isArray(candidate.config.configurations)
    ? candidate.config as LaunchConfig
    : null
  return {
    message: visibleMessage || (typeof candidate.message === 'string' ? candidate.message : '') || (
      trimmed && !trimmed.startsWith('{') && !trimmed.startsWith('```') ? trimmed : '已完成分析，但未收到完整的配置动作。'
    ),
    config,
    action,
    testScript: typeof candidate.testScript === 'string' && /^[\w:.-]+$/.test(candidate.testScript)
      ? candidate.testScript
      : undefined,
  }
}

export function visibleLaunchAssistantText(raw: string): string {
  const trimmedStart = raw.trimStart()
  if (trimmedStart.startsWith('{') || /^```(?:json)?/i.test(trimmedStart)) return ''
  const blockStart = raw.indexOf(ACTION_OPEN)
  if (blockStart >= 0) return raw.slice(0, blockStart)
  for (let length = Math.min(ACTION_OPEN.length - 1, raw.length); length > 0; length -= 1) {
    if (ACTION_OPEN.startsWith(raw.slice(-length))) return raw.slice(0, -length)
  }
  return raw
}

export function streamWorkspaceLaunchAssistant(input: {
  request: string
  analysis: WorkspaceLaunchAnalysis
  config: LaunchConfig
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
  onDelta: (delta: string) => void
  onDone: (response: LaunchAssistantResponse) => void
  onError: (error: string) => void
}): { abort: () => void } {
  let raw = ''
  let emitted = ''
  return chatStream(
    buildLaunchAssistantMessages(input),
    (delta) => {
      raw += delta
      const visible = visibleLaunchAssistantText(raw)
      if (visible.startsWith(emitted) && visible.length > emitted.length) {
        const addition = visible.slice(emitted.length)
        emitted = visible
        input.onDelta(addition)
      }
    },
    () => {
      const response = parseLaunchAssistantResponse(raw)
      if (response.message.startsWith(emitted) && response.message.length > emitted.length) {
        input.onDelta(response.message.slice(emitted.length))
      } else if (!emitted) {
        input.onDelta(response.message)
      }
      input.onDone(response)
    },
    input.onError,
    { sourceTag: 'janus-chat', workspaceId: input.analysis.workspaceId },
  )
}

export async function askWorkspaceLaunchAssistant(input: {
  request: string
  analysis: WorkspaceLaunchAnalysis
  config: LaunchConfig
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
}): Promise<LaunchAssistantResponse> {
  return new Promise((resolve, reject) => {
    streamWorkspaceLaunchAssistant({
      ...input,
      onDelta: () => undefined,
      onDone: resolve,
      onError: (error) => reject(new Error(error)),
    })
  })
}
