import { describe, expect, it } from 'vitest'
import {
  createTerminalServiceErrorDetector,
  isTerminalInterrupt,
} from '../../src/main/notifications/terminal-turn-signals'

describe('terminal turn signals', () => {
  it('recognizes only a standalone Ctrl+C input as an interrupt', () => {
    expect(isTerminalInterrupt('\x03')).toBe(true)
    expect(isTerminalInterrupt('text\x03')).toBe(false)
    expect(isTerminalInterrupt('\x1b[200~\x03\x1b[201~')).toBe(false)
  })

  it.each([
    'API Error: 429 rate_limit_error',
    'Request failed with status code 503',
    'unexpected status 429 Too Many Requests',
    'Error: service unavailable (503)',
    'request failure: server overloaded',
  ])('detects a service-ending error: %s', (message) => {
    const detector = createTerminalServiceErrorDetector()
    expect(detector.push(message)).toContain(message)
  })

  it('detects an ANSI-colored error split across PTY chunks', () => {
    const detector = createTerminalServiceErrorDetector()

    expect(detector.push('\x1b[31mRequest failed with status ')).toBeNull()
    expect(detector.push('code 503\x1b[0m')).toBe('Request failed with status code 503')
  })

  it.each([
    'please explain 429 and 503 handling',
    'the response status is 503',
    'rate limit settings',
    '503 tests passed',
  ])('does not classify ordinary terminal text: %s', (message) => {
    const detector = createTerminalServiceErrorDetector()
    expect(detector.push(message)).toBeNull()
  })

  it('clears partial context between turns', () => {
    const detector = createTerminalServiceErrorDetector()
    expect(detector.push('Request failed with status ')).toBeNull()
    detector.reset()
    expect(detector.push('code 503')).toBeNull()
  })
})
