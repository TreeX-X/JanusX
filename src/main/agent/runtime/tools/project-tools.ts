import { readdir } from 'fs/promises'
import { basename, join, resolve } from 'path'
import { ProjectConfig, ProjectDetector, ProjectType, detectByFeatures, getProjectSchema } from '../../../project'
import type { LaunchConfig } from '../../../../shared/ipc/project'
import { resolveWorkspaceTarget } from '../path-guard'
import { isSensitivePath } from '../policy-gate'
import type { RegisteredTool, ToolRegistry } from '../registry'

const DEFAULT_DEPTH = 2
const MAX_DEPTH = 3
const DEFAULT_MAX_DIRECTORIES = 50
const MAX_MAX_DIRECTORIES = 100
const registeredRegistries = new WeakSet<ToolRegistry>()

type ScanDirectory = {
  relativePath: string
  absolutePath: string
  depth: number
}

type ProjectCandidate = {
  path: string
  type: ProjectType
  confidence: number
  evidence: string[]
}

function assertWorkspaceId(input: Record<string, unknown>, context: { workspaceId: string }, toolName: string): string {
  const workspaceId = input.workspaceId
  if (typeof workspaceId !== 'string' || workspaceId !== context.workspaceId) {
    throw new Error(`${toolName} workspaceId must match the active workspace resource`)
  }
  return workspaceId
}

function validateScanOptions(input: Record<string, unknown>): { depth: number; maxDirectories: number } {
  const depth = input.depth ?? DEFAULT_DEPTH
  const maxDirectories = input.maxDirectories ?? DEFAULT_MAX_DIRECTORIES
  if (typeof depth !== 'number' || !Number.isSafeInteger(depth) || depth < 0 || depth > MAX_DEPTH) {
    throw new Error(`project scan depth must be an integer between 0 and ${MAX_DEPTH}`)
  }
  if (typeof maxDirectories !== 'number' || !Number.isSafeInteger(maxDirectories) || maxDirectories < 1 || maxDirectories > MAX_MAX_DIRECTORIES) {
    throw new Error(`project maxDirectories must be an integer between 1 and ${MAX_MAX_DIRECTORIES}`)
  }
  return { depth, maxDirectories }
}

function confidenceFor(type: ProjectType, entries: string[]): { confidence: number; evidence: string[] } {
  const features = getProjectSchema(type).featureFiles.filter((feature) => entries.some((entry) => entry.includes(feature)))
  const total = getProjectSchema(type).featureFiles.length
  return { confidence: total > 0 ? Math.min(features.length / total, 0.95) : 0.3, evidence: features }
}

async function scanProjectDirectories(
  workspaceRoot: string,
  requestedPath: string,
  depth: number,
  maxDirectories: number,
  signal: AbortSignal,
): Promise<{ rootPath: string; rootRelativePath: string; candidates: ProjectCandidate[] }> {
  const target = await resolveWorkspaceTarget(workspaceRoot, requestedPath)
  if (target.kind !== 'directory') throw new Error('project target path must be a directory')
  const rootPath = resolve(workspaceRoot, target.relativePath || '.')
  const queue: ScanDirectory[] = [{ relativePath: target.relativePath, absolutePath: rootPath, depth: 0 }]
  const candidates: ProjectCandidate[] = []
  let scanned = 0

  while (queue.length > 0 && scanned < maxDirectories) {
    if (signal.aborted) throw new Error('project detection cancelled')
    const current = queue.shift()!
    const directoryEntries = await readdir(current.absolutePath, { withFileTypes: true })
    const features = directoryEntries
      .filter((entry) => !entry.isSymbolicLink() && (entry.isDirectory() || entry.isFile()))
      .filter((entry) => {
        const relative = current.relativePath ? `${current.relativePath}/${entry.name}` : entry.name
        return !isSensitivePath(relative)
      })
      .map((entry) => entry.isDirectory() ? `${entry.name}/` : entry.name)
    scanned++
    const detected = detectByFeatures(features)
    for (const type of detected) {
      const result = confidenceFor(type, features)
      candidates.push({ path: current.relativePath, type, confidence: result.confidence, evidence: result.evidence })
    }
    if (current.depth >= depth) continue
    for (const entry of directoryEntries) {
      if (entry.isSymbolicLink() || !entry.isDirectory()) continue
      const relativePath = current.relativePath ? `${current.relativePath}/${entry.name}` : entry.name
      if (isSensitivePath(relativePath)) continue
      queue.push({
        relativePath,
        absolutePath: join(current.absolutePath, entry.name),
        depth: current.depth + 1,
      })
    }
  }

  return { rootPath, rootRelativePath: target.relativePath, candidates }
}

function projectConfigFromDetection(
  projectPath: string,
  details: Awaited<ReturnType<typeof ProjectDetector.detectWithDetails>>,
  requestedType?: ProjectType,
): LaunchConfig {
  const projectName = basename(projectPath) || 'app'
  const projectType = requestedType ?? details.type
  const config = ProjectConfig.createDefault(projectPath, projectType, projectName)
  if (!requestedType || requestedType === details.type) {
    config.configurations = [{ ...details.recommendedConfig, type: projectType }]
  }
  config.metadata = { autoDetected: true, lastModified: new Date().toISOString() }
  return config
}

export const projectDetectTool: RegisteredTool = {
  name: 'project.detect',
  description: 'Detect project types and candidate directories inside an explicitly selected workspace',
  actionRisk: 'inspect',
  inputSchema: {
    type: 'object',
    properties: {
      workspaceId: { type: 'string' },
      path: { type: 'string' },
      depth: { type: 'number' },
      maxDirectories: { type: 'number' },
    },
    required: ['workspaceId'],
    additionalProperties: false,
  },
  execute: async (input, context) => {
    const workspaceId = assertWorkspaceId(input, context, 'project.detect')
    const requestedPath = input.path ?? ''
    if (typeof requestedPath !== 'string') throw new Error('project.detect path must be a string')
    const { depth, maxDirectories } = validateScanOptions(input)
    if (context.signal.aborted) throw new Error('project detection cancelled')
    const scan = await scanProjectDirectories(context.workspaceRoot, requestedPath, depth, maxDirectories, context.signal)
    const details = await ProjectDetector.detectWithDetails(scan.rootPath)
    const primary = details.type === ProjectType.Unknown ? scan.candidates[0] : undefined
    return {
      workspaceId,
      path: scan.rootRelativePath,
      type: primary?.type ?? details.type,
      confidence: primary?.confidence ?? details.confidence,
      evidence: primary?.evidence ?? details.detectedFeatures,
      candidates: scan.candidates,
      recommendedConfiguration: details.recommendedConfig,
      availableScripts: details.availableScripts ?? [],
    }
  },
}

export const projectGenerateConfigTool: RegisteredTool = {
  name: 'project.generate-config',
  description: 'Generate a validated candidate LaunchConfig without writing it to the workspace',
  actionRisk: 'inspect',
  inputSchema: {
    type: 'object',
    properties: {
      workspaceId: { type: 'string' },
      path: { type: 'string' },
      projectType: { type: 'string' },
    },
    required: ['workspaceId'],
    additionalProperties: false,
  },
  execute: async (input, context) => {
    const workspaceId = assertWorkspaceId(input, context, 'project.generate-config')
    const requestedPath = input.path ?? ''
    if (typeof requestedPath !== 'string') throw new Error('project.generate-config path must be a string')
    const target = await resolveWorkspaceTarget(context.workspaceRoot, requestedPath)
    if (target.kind !== 'directory') throw new Error('project.generate-config path must be a directory')
    if (context.signal.aborted) throw new Error('project config generation cancelled')
    const projectPath = resolve(context.workspaceRoot, target.relativePath || '.')
    const details = await ProjectDetector.detectWithDetails(projectPath)
    const requestedType = input.projectType
    if (requestedType !== undefined && (typeof requestedType !== 'string' || !Object.values(ProjectType).includes(requestedType as ProjectType))) {
      throw new Error('project.generate-config projectType is invalid')
    }
    const config = projectConfigFromDetection(projectPath, details, requestedType as ProjectType | undefined)
    const validation = ProjectConfig.validate(config)
    return { workspaceId, path: target.relativePath, config, validation }
  },
}

export const projectApplyConfigTool: RegisteredTool = {
  name: 'project.apply-config',
  description: 'Validate and apply a candidate LaunchConfig to an explicitly selected workspace',
  actionRisk: 'config-apply',
  inputSchema: {
    type: 'object',
    properties: {
      workspaceId: { type: 'string' },
      path: { type: 'string' },
      config: { type: 'object' },
    },
    required: ['workspaceId', 'config'],
    additionalProperties: false,
  },
  execute: async (input, context) => {
    const workspaceId = assertWorkspaceId(input, context, 'project.apply-config')
    const requestedPath = input.path ?? ''
    if (typeof requestedPath !== 'string') throw new Error('project.apply-config path must be a string')
    if (!input.config || typeof input.config !== 'object' || Array.isArray(input.config)) throw new Error('project.apply-config config must be an object')
    const target = await resolveWorkspaceTarget(context.workspaceRoot, requestedPath)
    if (target.kind !== 'directory') throw new Error('project.apply-config path must be a directory')
    const config = structuredClone(input.config) as LaunchConfig
    const validation = ProjectConfig.validate(config)
    if (!validation.valid) throw new Error(`Project configuration is invalid: ${validation.errors.map((error) => error.message).join('; ')}`)
    if (context.signal.aborted) throw new Error('project config application cancelled')
    await ProjectConfig.write(resolve(context.workspaceRoot, target.relativePath || '.'), config)
    return { workspaceId, path: target.relativePath, validation, applied: true }
  },
}

export function registerProjectTools(registry: ToolRegistry): void {
  if (registeredRegistries.has(registry)) return
  registry.register(projectDetectTool)
  registry.register(projectGenerateConfigTool)
  registry.register(projectApplyConfigTool)
  registeredRegistries.add(registry)
}
