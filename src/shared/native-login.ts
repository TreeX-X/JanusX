import type { LlmConsumer } from './llm-configuration'

// Magpie-style "login first" for native bindings: detect whether the external
// Agent already holds local credentials, and describe how to trigger its own
// official login. JanusX never reads credential contents or manages tokens —
// ownership stays with each CLI. See .agents/notes/terminal/terminal-provider-collections.md

export type NativeLoginStatus = 'logged-in' | 'logged-out' | 'unknown'

export interface NativeLoginState {
  status: NativeLoginStatus
  checkedAt: string
  /** Tail of a background login PTY that died early (e.g. port bind failure). */
  launchError?: string
}

/** How the Agent's official login is launched in a JanusX terminal. */
export type NativeLoginAction =
  /** Interactive TUI slash command submitted after the preset terminal is ready. */
  | { kind: 'tui-command'; preset: 'claude'; command: string }
  /** One-shot CLI arguments; the preset program runs the login directly (usually browser OAuth). */
  | { kind: 'preset-args'; preset: 'codex' | 'opencode'; args: string[] }

export interface NativeLoginAgentCapability {
  /** False when no credential location is known (status stays unknown, never blocks). */
  detectable: boolean
  /**
   * Credentials file location. `base = env[envOverride] || home/…baseSegments`,
   * `file = base/…path`. Env override names match ConnectionProjector so the
   * probed file lives next to the config JanusX manages.
   */
  credentials?: { envOverride?: string; baseSegments: string[]; path: string[] }
  login?: NativeLoginAction
}

export const NATIVE_LOGIN_CAPABILITIES: Record<Exclude<LlmConsumer, 'janus'>, NativeLoginAgentCapability> = {
  claude: {
    detectable: true,
    credentials: { envOverride: 'CLAUDE_CONFIG_DIR', baseSegments: ['.claude'], path: ['.credentials.json'] },
    login: { kind: 'tui-command', preset: 'claude', command: '/login' },
  },
  codex: {
    detectable: true,
    credentials: { envOverride: 'CODEX_HOME', baseSegments: ['.codex'], path: ['auth.json'] },
    login: { kind: 'preset-args', preset: 'codex', args: ['login'] },
  },
  opencode: {
    detectable: true,
    credentials: { envOverride: 'XDG_DATA_HOME', baseSegments: ['.local', 'share'], path: ['opencode', 'auth.json'] },
    login: { kind: 'preset-args', preset: 'opencode', args: ['auth', 'login'] },
  },
  pi: { detectable: false },
}

/**
 * How to spawn the Agent's own login. `command` is resolved to an absolute
 * binary at launch; `submitLine` (TUI slash commands) is written to the
 * background PTY after it boots. The CLI opens the browser itself — JanusX
 * never hosts the OAuth flow.
 */
export interface NativeLoginLaunchPlan {
  command: string
  args: string[]
  submitLine?: string
}

export function nativeLoginLaunchPlan(consumer: LlmConsumer): NativeLoginLaunchPlan | null {
  if (consumer === 'janus') return null
  const login = NATIVE_LOGIN_CAPABILITIES[consumer].login
  if (!login) return null
  if (login.kind === 'tui-command') return { command: login.preset, args: [], submitLine: login.command }
  return { command: login.preset, args: login.args }
}
