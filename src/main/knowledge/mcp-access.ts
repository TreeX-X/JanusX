import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { knowledgeRootPath } from './constants'
import { normalizeExperimentalFeatures } from '../../shared/ipc/experimental'
import { normalizeKnowledgeSettings } from '../../shared/knowledge-settings'

// Note: standalone MCP rechecks persisted authorization on every request — see .agents/notes/terminal/mcp-terminal-coverage.md
export async function isKnowledgeMcpAllowed(): Promise<boolean> {
  try {
    const config = JSON.parse(await readFile(process.env.JANUSX_CONFIG_PATH || join(dirname(knowledgeRootPath()), 'config.json'), 'utf8'))
    return normalizeExperimentalFeatures(config.experimentalFeatures).knowledge && normalizeKnowledgeSettings(config.knowledgeSettings).enabled
  } catch { return false }
}
