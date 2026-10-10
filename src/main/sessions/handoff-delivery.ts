/**
 * Focused-handoff delivery for Continue in New Session.
 *
 * The handoff is the only thing the new session receives, so "we wrote it" and
 * "the agent received it" are different claims. A fixed delay writes blind: a
 * slow TUI that has not opened its composer eats the line, and the whole
 * handoff vanishes with nothing on screen saying so. This module waits for the
 * composer instead, writes the handoff as one bracketed paste, and reports
 * which of the three actually happened.
 */

export type HandoffVerdict = 'delivered' | 'unconfirmed' | 'failed'

export type HandoffDeliveryResult = {
  verdict: HandoffVerdict
  reason?: string
}

/** Everything this module needs from a live terminal. Injected so tests drive it. */
export type HandoffTransport = {
  /** False once the pty is gone. */
  isAlive(): boolean
  /** Write raw bytes. False when the pty refused the write. */
  write(data: string): boolean
  /** Sidecar tap on pty output; does not disturb the primary handler. */
  observeOutput(handler: (data: string) => void): () => void
}

export type HandoffDeliveryOptions = {
  /** Budget for the pty to appear at all. A miss here is a failed launch. */
  spawnTimeoutMs?: number
  /** Budget for the agent's composer to accept input. */
  readinessTimeoutMs?: number
  /** How long output must go quiet before we call the composer ready. */
  quietWindowMs?: number
  /** Gap between bracketed-paste end and Enter, so the TUI closes the paste first. */
  submitDelayMs?: number
  /**
   * Engine-specific readiness marker seen in the output, e.g. a composer prompt.
   * DECSET 2004 and the quiet window cover everything without one.
   */
  readyPattern?: RegExp
  sleep?: (ms: number) => Promise<void>
}

export const HANDOFF_SPAWN_TIMEOUT_MS = 8000
export const HANDOFF_READINESS_TIMEOUT_MS = 20000
const HANDOFF_QUIET_WINDOW_MS = 1500
const HANDOFF_SUBMIT_DELAY_MS = 50
const ESC = '\x1b'
/** DECSET 2004: "I accept bracketed paste". The protocol-level ready handshake. */
const BRACKETED_PASTE_ENABLE = `${ESC}[?2004h`
const BRACKETED_PASTE_START = `${ESC}[200~`
const BRACKETED_PASTE_END = `${ESC}[201~`

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Resolve true once the agent's input is ready.
 *
 * Readiness is DECSET 2004, an engine marker, or output going quiet after the
 * agent has produced something at all — not a fixed delay. Silence from a
 * terminal that never printed is a timeout, not a composer, so a quiet window
 * only counts once output has been seen. A timeout resolves false so the
 * caller can tell a blind write apart from a confirmed one.
 */
export function waitForComposerReady(
  transport: HandoffTransport,
  timeoutMs: number,
  options: Pick<HandoffDeliveryOptions, 'quietWindowMs' | 'readyPattern'> = {},
): Promise<boolean> {
  const quietWindowMs = options.quietWindowMs ?? HANDOFF_QUIET_WINDOW_MS
  return new Promise<boolean>((resolve) => {
    let settled = false
    let quietTimer: ReturnType<typeof setTimeout> | null = null
    let hardTimer: ReturnType<typeof setTimeout> | null = null
    let unsubscribe: (() => void) | null = null

    const finish = (value: boolean): void => {
      if (settled) return
      settled = true
      if (quietTimer !== null) clearTimeout(quietTimer)
      if (hardTimer !== null) clearTimeout(hardTimer)
      unsubscribe?.()
      resolve(value)
    }

    unsubscribe = transport.observeOutput((data) => {
      if (data.includes(BRACKETED_PASTE_ENABLE)) {
        finish(true)
        return
      }
      if (options.readyPattern?.test(data)) {
        finish(true)
        return
      }
      // Only output arms the quiet window, so a terminal that printed nothing
      // can never resolve ready by waiting it out.
      if (quietTimer !== null) clearTimeout(quietTimer)
      quietTimer = setTimeout(() => finish(true), quietWindowMs)
    })

    if (!settled) {
      hardTimer = setTimeout(() => finish(false), timeoutMs)
    }
  })
}

/**
 * Deliver one focused handoff into a freshly launched agent terminal.
 *
 * `delivered` means the composer was observed and the write landed.
 * `unconfirmed` means the write landed but no composer was ever seen, so the
 * prompt may be sitting nowhere: the caller must tell the user to check and
 * offer a copy. `failed` means nothing was delivered.
 */
export async function deliverHandoff(args: {
  transport: HandoffTransport
  handoff: string
  options?: HandoffDeliveryOptions
}): Promise<HandoffDeliveryResult> {
  const { transport, handoff } = args
  const options = args.options ?? {}
  const sleep = options.sleep ?? defaultSleep
  const spawnTimeoutMs = options.spawnTimeoutMs ?? HANDOFF_SPAWN_TIMEOUT_MS
  const readinessTimeoutMs = options.readinessTimeoutMs ?? HANDOFF_READINESS_TIMEOUT_MS

  if (!handoff.trim()) {
    return { verdict: 'failed', reason: 'empty handoff' }
  }

  // Budgets stay separate so a slow launch cannot spend the composer budget
  // and a slow composer cannot be mistaken for a failed launch.
  const spawnDeadline = Date.now() + spawnTimeoutMs
  while (!transport.isAlive()) {
    if (Date.now() >= spawnDeadline) {
      return { verdict: 'failed', reason: 'terminal never came up' }
    }
    await sleep(50)
  }

  const ready = await waitForComposerReady(transport, readinessTimeoutMs, options)

  if (!transport.isAlive()) {
    return { verdict: 'failed', reason: 'terminal exited before delivery' }
  }

  // Bracketed paste keeps the handoff one atomic insert instead of character
  // echoes or line-edit shortcuts. Paste end and Enter get their own writes:
  // some TUIs leave the prompt editable when both land in one write.
  const paste = `${BRACKETED_PASTE_START}${handoff}${BRACKETED_PASTE_END}`
  if (!transport.write(paste)) {
    return { verdict: 'failed', reason: 'paste was refused' }
  }
  await sleep(options.submitDelayMs ?? HANDOFF_SUBMIT_DELAY_MS)
  if (!transport.isAlive()) {
    return { verdict: 'unconfirmed', reason: 'terminal exited before submit' }
  }
  if (!transport.write('\r')) {
    return { verdict: 'unconfirmed', reason: 'submit was refused' }
  }

  return ready
    ? { verdict: 'delivered' }
    : { verdict: 'unconfirmed', reason: 'composer was never observed' }
}
