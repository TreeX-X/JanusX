import type {
  Blueprint,
  BlueprintAnalysis,
  BlueprintFeatureItem,
  BlueprintNode,
  BlueprintRequirementCandidate,
} from '../../../shared/janus/types'
import type {
  AcceptCandidatePayload,
  AcceptDiscoveredPayload,
  AnalysisHistoryPayload,
  AnalyzerAnalyzePayload,
  ApplyAnalysisPatchPayload,
  ApplyAnalysisPayload,
  BlueprintCreateInput,
  BlueprintUpdatePatch,
  FeatureItemInput,
  FocusNodePayload,
  IslandAnalysisEvent,
  IslandDiscoveredEvent,
  ListCandidatesPayload,
  NodeCreateInput,
  RejectCandidatePayload,
} from '../../../shared/ipc/janus'

export type {
  AnalysisInputSummary,
  AnalysisResult,
  AnalysisTrigger,
  Blueprint,
  BlueprintActivity,
  BlueprintActivityType,
  BlueprintAnalysis,
  BlueprintFeatureItem,
  BlueprintIssue,
  BlueprintIssueSeverity,
  BlueprintIssueStatus,
  BlueprintNode,
  BlueprintNodeStatus,
  BlueprintNodeType,
  BlueprintRequirementCandidate,
  BlueprintRequirementCandidateStatus,
  BlueprintStatusSource,
  BlueprintTodo,
  DiscoveredRequirement,
} from '../../../shared/janus/types'

export type {
  AcceptCandidatePayload,
  AcceptDiscoveredPayload,
  AnalysisHistoryPayload,
  AnalyzerAnalyzePayload,
  ApplyAnalysisPatchPayload,
  ApplyAnalysisPayload,
  BlueprintCreateInput,
  BlueprintUpdatePatch,
  FeatureItemInput,
  FocusNodePayload,
  IslandAnalysisEvent,
  IslandDiscoveredEvent,
  ListCandidatesPayload,
  NodeCreateInput,
  RejectCandidatePayload,
} from '../../../shared/ipc/janus'

export function listBlueprints(cwd: string): Promise<Blueprint[] | null> {
  return window.electron.janus.listBlueprints(cwd)
}

export function loadBlueprint(cwd: string, id: string): Promise<Blueprint | null> {
  return window.electron.janus.loadBlueprint(cwd, id)
}

export function createBlueprint(cwd: string, input: BlueprintCreateInput): Promise<Blueprint> {
  return window.electron.janus.createBlueprint(cwd, input)
}

export function updateBlueprint(
  cwd: string,
  id: string,
  patch: BlueprintUpdatePatch
): Promise<Blueprint | null> {
  return window.electron.janus.updateBlueprint(cwd, id, patch)
}

export function deleteBlueprint(cwd: string, id: string): Promise<boolean> {
  return window.electron.janus.deleteBlueprint(cwd, id)
}

export function createNode(
  cwd: string,
  blueprintId: string,
  input: NodeCreateInput,
  parentId: string | null
): Promise<BlueprintNode | null> {
  return window.electron.janus.createNode(cwd, blueprintId, input, parentId)
}

export function replaceNodeFeatures(
  cwd: string,
  blueprintId: string,
  nodeId: string,
  features: FeatureItemInput[]
): Promise<BlueprintNode | null> {
  return window.electron.janus.replaceNodeFeatures(cwd, blueprintId, nodeId, features)
}

export function addNodeFeature(
  cwd: string,
  blueprintId: string,
  nodeId: string,
  feature: FeatureItemInput
): Promise<BlueprintNode | null> {
  return window.electron.janus.addNodeFeature(cwd, blueprintId, nodeId, feature)
}

export function updateNodeFeature(
  cwd: string,
  blueprintId: string,
  nodeId: string,
  featureId: string,
  patch: Partial<BlueprintFeatureItem>
): Promise<BlueprintNode | null> {
  return window.electron.janus.updateNodeFeature(cwd, blueprintId, nodeId, featureId, patch)
}

export function deleteNodeFeature(
  cwd: string,
  blueprintId: string,
  nodeId: string,
  featureId: string
): Promise<BlueprintNode | null> {
  return window.electron.janus.deleteNodeFeature(cwd, blueprintId, nodeId, featureId)
}

export function updateNode(
  cwd: string,
  blueprintId: string,
  nodeId: string,
  patch: Partial<BlueprintNode>
): Promise<BlueprintNode | null> {
  return window.electron.janus.updateNode(cwd, blueprintId, nodeId, patch)
}

export function deleteNode(cwd: string, blueprintId: string, nodeId: string): Promise<boolean> {
  return window.electron.janus.deleteNode(cwd, blueprintId, nodeId)
}

export function focusNode(payload: FocusNodePayload): Promise<BlueprintNode | null> {
  return window.electron.janus.focusNode(payload)
}

export function bindTerminal(
  cwd: string,
  nodeId: string,
  terminalId: string
): Promise<BlueprintNode | null> {
  return window.electron.janus.bindTerminal(cwd, nodeId, terminalId)
}

export function analyze(payload: AnalyzerAnalyzePayload): Promise<BlueprintAnalysis | null> {
  return window.electron.janus.analyze(payload)
}

export function applyAnalysisPatch(payload: ApplyAnalysisPatchPayload): Promise<BlueprintNode | null> {
  return window.electron.janus.applyAnalysisPatch(payload)
}

export function acceptDiscovered(payload: AcceptDiscoveredPayload): Promise<BlueprintNode | null> {
  return window.electron.janus.acceptDiscovered(payload)
}

export function listAnalyses(payload: AnalysisHistoryPayload): Promise<BlueprintAnalysis[]> {
  return window.electron.janus.listAnalyses(payload)
}

export function applyAnalysis(payload: ApplyAnalysisPayload): Promise<BlueprintNode | null> {
  return window.electron.janus.applyAnalysis(payload)
}

export function listRequirementCandidates(
  payload: ListCandidatesPayload
): Promise<BlueprintRequirementCandidate[]> {
  return window.electron.janus.listRequirementCandidates(payload)
}

export function acceptRequirementCandidate(
  payload: AcceptCandidatePayload
): Promise<BlueprintNode | null> {
  return window.electron.janus.acceptRequirementCandidate(payload)
}

export function rejectRequirementCandidate(
  payload: RejectCandidatePayload
): Promise<BlueprintRequirementCandidate | null> {
  return window.electron.janus.rejectRequirementCandidate(payload)
}

export function onAnalysisResult(callback: (event: IslandAnalysisEvent) => void): () => void {
  return window.electron.janus.onAnalysisResult(callback)
}

export function onDiscovered(callback: (event: IslandDiscoveredEvent) => void): () => void {
  return window.electron.janus.onDiscovered(callback)
}
