export { ClaudeParser } from './claude-parser'
export { CodexParser } from './codex-parser'
export { OpenCodeParser } from './opencode-parser'
export { DshParser } from './dsh-parser'

import type { AgentEngine, StreamParser } from '../types'
import { ClaudeParser } from './claude-parser'
import { CodexParser } from './codex-parser'
import { OpenCodeParser } from './opencode-parser'
import { DshParser } from './dsh-parser'

export function createParser(engine: AgentEngine): StreamParser {
  switch (engine) {
    case 'claude':
      return new ClaudeParser()
    case 'codex':
      return new CodexParser()
    case 'opencode':
      return new OpenCodeParser()
    case 'dsh':
      return new DshParser()
    default:
      // Headless subprocess runner stays claude/codex/opencode/dsh-only:
      // janus/pi run as interactive terminals with hook extensions, never here.
      throw new Error(`Unsupported headless engine: ${engine}`)
  }
}
