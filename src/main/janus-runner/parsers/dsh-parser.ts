import type { AgentEvent, StreamParser } from '../types'

/**
 * Parser for `dsh --profile headless --json` newline-delimited run events.
 * Protocol verified against dsh 0.2.0-rc.2 (see
 * .agents/notes/terminal/dsh-terminal-integration.md, headless protocol): `session` opens, `status`
 * carries turn/step phases, `thinking`/`text` carry committed blocks,
 * `tool_call`/`tool_result` bracket tool use, `final` repeats the lossless
 * answer (already streamed as `text`, so it maps to nothing; process close
 * owns the `done` lifecycle like every other engine).
 */
const THINKING_LABEL_LIMIT = 200

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function toolArg(input: Record<string, unknown> | undefined): string {
  if (!input) return ''
  const candidate = input.command ?? input.filePath ?? input.path ?? input.query ?? input.description
  return typeof candidate === 'string' ? candidate : ''
}

function toolFilePath(input: Record<string, unknown> | undefined): string | undefined {
  if (!input) return undefined
  const candidate = input.filePath ?? input.path
  return typeof candidate === 'string' && candidate ? candidate : undefined
}

export class DshParser implements StreamParser {
  parseLine(json: Record<string, unknown>): AgentEvent[] {
    const events: AgentEvent[] = []
    const type = json.type as string

    switch (type) {
      case 'text': {
        const text = json.text
        if (typeof text === 'string' && text) events.push({ type: 'text-chunk', text })
        break
      }
      case 'thinking': {
        const text = json.text
        if (typeof text === 'string' && text) {
          events.push({
            type: 'phase',
            phase: 'thinking',
            label: text.length > THINKING_LABEL_LIMIT ? `${text.slice(0, THINKING_LABEL_LIMIT)}…` : text,
          })
        }
        break
      }
      case 'tool_call': {
        const callId = json.callId
        const id = typeof callId === 'string' && callId ? callId : String(Date.now())
        const name = typeof json.tool === 'string' && json.tool ? json.tool : 'unknown'
        const input = asRecord(json.input)
        events.push({ type: 'tool-start', id, name, arg: toolArg(input), filePath: toolFilePath(input) })
        break
      }
      case 'tool_result': {
        const callId = json.callId
        events.push({ type: 'tool-end', id: typeof callId === 'string' ? callId : '' })
        break
      }
      case 'status': {
        // Only failures surface here; turn/step lifecycle is owned by the
        // process close path. Success reason shapes are unobserved (no keyed
        // session yet), so non-error reasons map to nothing.
        if (json.phase === 'turn_end') {
          const reason = asRecord(json.reason)
          if (reason?.kind === 'error') {
            const error = asRecord(reason.error)
            const message = (typeof error?.message === 'string' && error.message)
              || (typeof reason.message === 'string' && reason.message)
              || 'DSH turn failed'
            events.push({ type: 'error', message })
          }
        }
        break
      }
      default:
        break
    }
    return events
  }

  reset(): void {
    // Stateless: every line maps independently, nothing to clear.
  }
}
