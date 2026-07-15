export interface OfficeWatchReadyChild {
  stdout: AsyncIterable<string | Uint8Array>
  stderr?: AsyncIterable<string | Uint8Array>
  exited: Promise<void>
  isAlive(): boolean
}

export interface OfficeWatchReadyOptions {
  child: OfficeWatchReadyChild
  port: number
  deadline: number
  now?: () => number
  reach?: (port: number) => Promise<boolean>
}

export type OfficeWatchReadyFailure = 'START_FAILED' | 'PORT_TIMEOUT'

const RETRY_DELAY_MS = 50

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function defaultReach(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(250),
    })
    return response.status < 500
  } catch {
    return false
  }
}

export function matchesExpectedWatchLine(line: string, port: number): boolean {
  return new RegExp(`^\\s*Watch:\\s+http://(?:localhost|127\\.0\\.0\\.1):${port}/?\\s*$`).test(line)
}

async function drainLines(
  stream: AsyncIterable<string | Uint8Array>,
  onLine?: (line: string) => void,
): Promise<void> {
  const decoder = new TextDecoder()
  let buffered = ''
  for await (const chunk of stream) {
    buffered += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })
    const lines = buffered.split(/\r?\n/)
    buffered = lines.pop() ?? ''
    lines.forEach((line) => onLine?.(line))
  }
  buffered += decoder.decode()
  if (buffered) onLine?.(buffered)
}

export async function waitForOfficeWatchReady(options: OfficeWatchReadyOptions): Promise<void> {
  const now = options.now ?? Date.now
  const reach = options.reach ?? defaultReach
  let matchLine: (() => void) | undefined
  const lineMatched = new Promise<void>((resolve) => { matchLine = resolve })
  const stdoutDone = drainLines(options.child.stdout, (line) => {
    if (matchesExpectedWatchLine(line, options.port)) matchLine?.()
  })
  void stdoutDone.catch(() => {})
  if (options.child.stderr) void drainLines(options.child.stderr).catch(() => {})

  const remaining = () => Math.max(0, options.deadline - now())
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      lineMatched,
      stdoutDone.then(() => { throw new Error('START_FAILED') }),
      options.child.exited.then(() => { throw new Error('START_FAILED') }),
      new Promise<void>((_, reject) => {
        timer = setTimeout(() => reject(new Error('PORT_TIMEOUT')), remaining())
        timer.unref?.()
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }

  while (remaining() > 0) {
    if (!options.child.isAlive()) throw new Error('START_FAILED')
    if (await reach(options.port)) {
      if (!options.child.isAlive()) throw new Error('START_FAILED')
      return
    }
    await delay(Math.min(RETRY_DELAY_MS, remaining()))
  }
  throw new Error('PORT_TIMEOUT')
}

export function readinessFailureCode(error: unknown): OfficeWatchReadyFailure {
  return error instanceof Error && error.message === 'PORT_TIMEOUT' ? 'PORT_TIMEOUT' : 'START_FAILED'
}
