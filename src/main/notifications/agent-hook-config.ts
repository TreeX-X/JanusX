import { app } from 'electron'
import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import type { AgentEngine } from '../janus-runner/types'
import type { AgentHookBridgeEnv } from './agent-hook-bridge'
import { JANUSX_HOOK_MATCHER_FLAG } from './agent-hook-types'

const execFileAsync = promisify(execFile)

export const JANUSX_HOOK_COMMAND_MARKER = 'janusx-agent-hook-v2'
const JANUSX_LEGACY_HOOK_COMMAND_MARKERS = [
  'janusx-hook-v1',
  '--janusx-hook',
  'TerminalAgentNotificationCoordinator',
  'terminal-agent-notification',
  'aiCliCompletion',
]

type HookableEngine = AgentEngine
type JsonObject = Record<string, unknown>

interface HookCommandSpec {
  event: string
  matcher?: string
}

interface AgentHookConfigManagerOptions {
  platform?: NodeJS.Platform
  homeDir?: string
  userDataDir?: string
  executablePath?: string
  appEntryArg?: string
  windowsHookScriptPath?: string
  /**
   * GUI-subsystem launcher for the Windows hook script (kills the visible
   * console flash). `undefined` resolves to `<home>/.janusx/hooks/<name>`;
   * `null` disables the runner and keeps the legacy powershell command.
   */
  windowsHookRunnerPath?: string | null
  /** Compile the runner on demand during install. Defaults to true. */
  compileHookRunner?: boolean
}

interface TerminalHookEnvInput {
  terminalId: string
  workspaceId: string
  engine: HookableEngine
}

export interface HookInstallResult {
  engine: HookableEngine
  installed: boolean
  path: string
}

const CLAUDE_HOOKS: HookCommandSpec[] = [
  { event: 'SessionStart' },
  { event: 'UserPromptSubmit' },
  // Split matchers into two entries so the fired matcher travels in the hook
  // command argv (--matcher/-Matcher): permission_prompt is a true approval
  // wait, while idle_prompt is a 60s-idle nudge that must never stain the tab
  // once the turn has closed — see the coordinator idle gate.
  { event: 'Notification', matcher: 'permission_prompt' },
  { event: 'Notification', matcher: 'idle_prompt' },
  { event: 'Stop' },
  { event: 'StopFailure' },
  // Fires on CLI exit/clear/logout: closes a still-open turn before the pty dies.
  { event: 'SessionEnd' },
]

const CODEX_HOOKS: HookCommandSpec[] = [
  { event: 'UserPromptSubmit' },
  { event: 'PermissionRequest' },
  { event: 'Stop' },
]

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function getObject(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null
}

function getHooksObject(settings: JsonObject): JsonObject {
  const existing = getObject(settings.hooks)
  if (existing) return existing
  const hooks: JsonObject = {}
  settings.hooks = hooks
  return hooks
}

function isManagedHook(value: unknown): boolean {
  const hook = getObject(value)
  if (!hook) return false
  const command = hook.command
  if (typeof command !== 'string') return false
  return [JANUSX_HOOK_COMMAND_MARKER, ...JANUSX_LEGACY_HOOK_COMMAND_MARKERS].some((marker) =>
    command.includes(marker),
  )
}

async function readJsonObject(filePath: string): Promise<JsonObject> {
  try {
    const raw = (await readFile(filePath, 'utf8')).replace(/^\uFEFF/, '')
    if (!raw.trim()) return {}
    const parsed = JSON.parse(raw) as unknown
    const object = getObject(parsed)
    if (!object) throw new Error(`${filePath} must contain a JSON object`)
    return object
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw error
  }
}

async function writeJsonObject(filePath: string, object: JsonObject): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(object, null, 2)}\n`, 'utf8')
}

function removeManagedHookCommands(settings: JsonObject): void {
  const hooks = getObject(settings.hooks)
  if (!hooks) return

  for (const [event, rawEntries] of Object.entries(hooks)) {
    const cleanedEntries: unknown[] = []
    for (const rawEntry of toArray(rawEntries)) {
      const entry = getObject(rawEntry)
      if (!entry) {
        cleanedEntries.push(rawEntry)
        continue
      }

      const keptInner = toArray(entry.hooks).filter((hook) => !isManagedHook(hook))
      if (keptInner.length === 0) continue
      cleanedEntries.push({ ...entry, hooks: keptInner })
    }

    if (cleanedEntries.length === 0) {
      delete hooks[event]
    } else {
      hooks[event] = cleanedEntries
    }
  }

  if (Object.keys(hooks).length === 0) {
    delete settings.hooks
  }
}

function addHookCommand(settings: JsonObject, spec: HookCommandSpec, command: string): void {
  const hooks = getHooksObject(settings)
  const entries = toArray(hooks[spec.event])
  const entry: JsonObject = {
    hooks: [
      {
        type: 'command',
        command,
      },
    ],
  }

  if (spec.matcher) {
    entry.matcher = spec.matcher
  }

  hooks[spec.event] = [...entries, entry]
}

function quotePowerShell(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function quotePosix(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

const WINDOWS_HOOK_RUNNER_FILE_NAME = 'janusx-hook-runner.exe'
const WINDOWS_HOOK_RUNNER_TIMEOUT_MS = 10000
const WINDOWS_HOOK_RUNNER_MAX_STDIN_BYTES = 4 * 1024 * 1024

/**
 * C# source of the hidden hook launcher. Compiled with OutputType
 * WindowsApplication, so the binary is a GUI-subsystem executable: Codex
 * spawning it allocates no console at all (upstream Codex spawns hook
 * commands without CREATE_NO_WINDOW — openai/codex#18984 — so any
 * console-subsystem process in the chain flashes a window). The runner
 * forwards hook stdin to a CREATE_NO_WINDOW powershell child, waits briefly,
 * and always exits 0 so the agent turn is never blocked.
 *
 * NOTE: plain concatenation only — no C# $"..." interpolation and no
 * backslashes, so this stays a safe TS template literal.
 */
export function buildHookRunnerSource(): string {
  return `using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading;
public static class JanusxHookRunner {
  private const int MaxStdinBytes = ${WINDOWS_HOOK_RUNNER_MAX_STDIN_BYTES};
  private const int WaitMs = ${WINDOWS_HOOK_RUNNER_TIMEOUT_MS};
  public static int Main(string[] args) {
    try {
      if (args == null || args.Length < 4) return 0;
      string script = args[0];
      if (string.IsNullOrWhiteSpace(script) || !File.Exists(script)) return 0;
      char q = (char)34;
      StringBuilder sb = new StringBuilder();
      sb.Append("-NoProfile -ExecutionPolicy Bypass -File ");
      sb.Append(q).Append(script).Append(q);
      sb.Append(" -Source ").Append(q).Append(Clean(args[1])).Append(q);
      sb.Append(" -EventName ").Append(q).Append(Clean(args[2])).Append(q);
      sb.Append(" -Marker ").Append(q).Append(Clean(args[3])).Append(q);
      if (args.Length > 4 && !string.IsNullOrWhiteSpace(args[4])) {
        sb.Append(" -Matcher ").Append(q).Append(Clean(args[4])).Append(q);
      }
      byte[] input = ReadStdin();
      ProcessStartInfo psi = new ProcessStartInfo();
      psi.FileName = "powershell.exe";
      psi.Arguments = sb.ToString();
      psi.CreateNoWindow = true;
      psi.UseShellExecute = false;
      psi.RedirectStandardInput = true;
      psi.RedirectStandardOutput = true;
      psi.RedirectStandardError = true;
      using (Process p = Process.Start(psi)) {
        if (p == null) return 0;
        try { p.StandardInput.BaseStream.Write(input, 0, input.Length); } catch { }
        try { p.StandardInput.Close(); } catch { }
        Thread drain = new Thread(delegate() { try { p.StandardOutput.ReadToEnd(); } catch { } });
        drain.IsBackground = true;
        drain.Start();
        try { p.StandardError.ReadToEnd(); } catch { }
        if (!p.WaitForExit(WaitMs)) { try { p.Kill(); } catch { } }
      }
    } catch { }
    return 0;
  }
  private static string Clean(string v) {
    if (v == null) return string.Empty;
    StringBuilder sb = new StringBuilder(v.Length);
    foreach (char c in v) { if (c != (char)34) sb.Append(c); }
    return sb.ToString();
  }
  private static byte[] ReadStdin() {
    using (MemoryStream ms = new MemoryStream()) {
      Stream stdin = Console.OpenStandardInput();
      byte[] buf = new byte[8192];
      int total = 0;
      while (total < MaxStdinBytes) {
        int n = stdin.Read(buf, 0, Math.Min(buf.Length, MaxStdinBytes - total));
        if (n <= 0) break;
        ms.Write(buf, 0, n);
        total += n;
      }
      return ms.ToArray();
    }
  }
}
`
}

/** Double-quote for CreateProcess/bash command lines; hook argv never legitimately contains quotes. */
function quoteWindowsArg(value: string): string {
  return `"${value.replace(/"/g, '')}"`
}

function buildHookCommand(
  platform: NodeJS.Platform,
  executablePath: string,
  appEntryArg: string | undefined,
  source: HookableEngine,
  event: string,
  windowsHookScriptPath?: string,
  matcher?: string,
  windowsHookRunnerPath?: string,
): string {
  if (platform === 'win32' && windowsHookScriptPath) {
    if (windowsHookRunnerPath) {
      // GUI-subsystem launcher: no console is allocated for the runner
      // itself and the powershell child runs with CREATE_NO_WINDOW, so hook
      // events no longer flash a terminal window. Argv carries the marker so
      // managed-hook detection keeps working. No $vars: hook commands may run
      // through bash, which would expand them before spawn.
      return [
        quoteWindowsArg(windowsHookRunnerPath),
        quoteWindowsArg(windowsHookScriptPath),
        quoteWindowsArg(source),
        quoteWindowsArg(event),
        quoteWindowsArg(JANUSX_HOOK_COMMAND_MARKER),
        ...(matcher ? [quoteWindowsArg(matcher)] : []),
      ].join(' ')
    }
    const command = [
      '&',
      quotePowerShell(windowsHookScriptPath),
      '-Source',
      quotePowerShell(source),
      '-EventName',
      quotePowerShell(event),
      '-Marker',
      quotePowerShell(JANUSX_HOOK_COMMAND_MARKER),
      ...(matcher ? ['-Matcher', quotePowerShell(matcher)] : []),
    ].join(' ')

    // The hook script sets its own UTF-8 encoding internally, so the guard only
    // needs the Test-Path check. Avoid inline PowerShell variables ($utf8 etc.)
    // here: Claude Code/Codex run hook commands through bash, which expands $var
    // before powershell sees it, corrupting the command.
    const guardedCommand = [
      `if (-not (Test-Path -LiteralPath ${quotePowerShell(windowsHookScriptPath)})) { exit 0 }`,
      command,
    ].join('; ')

    return [
      'powershell',
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `"${guardedCommand.replace(/"/g, '`"')}"`,
    ].join(' ')
  }

  const args = [
    ...(appEntryArg ? [appEntryArg] : []),
    '--janusx-hook',
    '--source',
    source,
    '--event',
    event,
    '--janusx-hook-marker',
    JANUSX_HOOK_COMMAND_MARKER,
    ...(matcher ? [JANUSX_HOOK_MATCHER_FLAG, matcher] : []),
  ]

  if (platform === 'win32') {
    const command = ['&', quotePowerShell(executablePath), ...args.map(quotePowerShell)].join(' ')
    return `powershell -NoProfile -ExecutionPolicy Bypass -Command "${command.replace(/"/g, '`"')}"`
  }

  return [executablePath, ...args].map(quotePosix).join(' ')
}

function resolveAppEntryArg(explicitAppEntryArg: string | undefined): string | undefined {
  if (explicitAppEntryArg !== undefined) {
    return explicitAppEntryArg
  }

  if (app.isPackaged) {
    return undefined
  }

  const appPath = app.getAppPath()
  if (appPath) {
    return appPath
  }

  const argvEntry = process.argv[1]
  return argvEntry && isAbsolute(argvEntry) ? argvEntry : undefined
}

async function installJsonHooks(
  filePath: string,
  specs: HookCommandSpec[],
  platform: NodeJS.Platform,
  executablePath: string,
  appEntryArg: string | undefined,
  source: HookableEngine,
  windowsHookScriptPath?: string,
  windowsHookRunnerPath?: string,
): Promise<HookInstallResult> {
  const settings = await readJsonObject(filePath)

  removeManagedHookCommands(settings)
  for (const spec of specs) {
    addHookCommand(
      settings,
      spec,
      buildHookCommand(platform, executablePath, appEntryArg, source, spec.event, windowsHookScriptPath, spec.matcher, windowsHookRunnerPath),
    )
  }

  await writeJsonObject(filePath, settings)
  return { engine: source, installed: true, path: filePath }
}

async function uninstallJsonHooks(filePath: string, engine: HookableEngine): Promise<HookInstallResult> {
  const settings = await readJsonObject(filePath)
  removeManagedHookCommands(settings)
  await writeJsonObject(filePath, settings)
  return { engine, installed: false, path: filePath }
}

function mergeWslenv(existing: string | undefined, keys: string[]): string {
  const current = existing?.split(':').filter(Boolean) ?? []
  const merged = [...current]
  for (const key of keys) {
    if (!merged.includes(key)) merged.push(key)
  }
  return merged.join(':')
}

function buildOpencodePlugin(): string {
  return `const TARGET_EVENTS = new Set(["session.created", "session.updated", "session.status", "session.idle", "session.error", "permission.asked"]);

function env(name) {
  const value = process.env[name];
  return value && value.trim() ? value : undefined;
}

function extractMessage(event) {
  if (!event || typeof event !== "object") return undefined;
  const properties = event.properties && typeof event.properties === "object" ? event.properties : {};
  const candidates = [event.message, event.error, event.reason, properties.message, properties.error, properties.reason];
  return candidates.find((value) => typeof value === "string" && value.trim());
}

function extractSessionId(event) {
  if (!event || typeof event !== "object") return undefined;
  const properties = event.properties && typeof event.properties === "object" ? event.properties : {};
  const session = properties.session && typeof properties.session === "object" ? properties.session : {};
  const candidates = [event.sessionID, event.sessionId, event.session_id, properties.sessionID, properties.sessionId, properties.session_id, session.id, session.sessionID, session.sessionId];
  return candidates.find((value) => typeof value === "string" && value.trim());
}

async function postToJanusX(event, directory) {
  const port = env("JANUSX_HOOK_PORT");
  const token = env("JANUSX_HOOK_TOKEN");
  if (!port || !token || !event || !TARGET_EVENTS.has(event.type)) return;

  await fetch("http://127.0.0.1:" + port + "/api/agent-hook", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source: "opencode",
      event: event.type,
      terminalId: env("JANUSX_HOOK_TERMINAL_ID"),
      workspaceId: env("JANUSX_HOOK_WORKSPACE_ID"),
      sessionId: extractSessionId(event),
      cwd: directory,
      message: extractMessage(event),
      timestamp: new Date().toISOString(),
      raw: event,
    }),
  }).catch(() => {});
}

export const JanusXNotifyPlugin = async ({ directory }) => ({
  event: async ({ event }) => {
    await postToJanusX(event, directory);
  },
});
`
}

// Note: janus/pi hook coverage — see .agents/notes/2026-09-13-janus-pi-hook-management--a8a80c8f.md
export function buildPiExtension(): string {
  return `function env(name) {
  const value = process.env[name];
  return value && value.trim() ? value : undefined;
}

async function postToJanusX(eventType, fields) {
  const port = env("JANUSX_HOOK_PORT");
  const token = env("JANUSX_HOOK_TOKEN");
  if (!port || !token || !eventType) return;

  await fetch("http://127.0.0.1:" + port + "/api/agent-hook", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source: "pi",
      event: eventType,
      terminalId: env("JANUSX_HOOK_TERMINAL_ID"),
      workspaceId: env("JANUSX_HOOK_WORKSPACE_ID"),
      sessionId: undefined,
      cwd: fields.cwd,
      message: fields.message,
      timestamp: new Date().toISOString(),
      raw: fields.raw,
    }),
  }).catch(() => {});
}

function safeCwd(ctx) {
  try {
    const cwd = ctx && ctx.cwd;
    return typeof cwd === "string" && cwd.trim() ? cwd : undefined;
  } catch {
    return undefined;
  }
}

function safeTitle(event) {
  try {
    const title = event && event.title;
    return typeof title === "string" && title.trim() ? title : undefined;
  } catch {
    return undefined;
  }
}

export default function janusxNotify(pi) {
  pi.on("agent_start", async (_event, ctx) => {
    try {
      await postToJanusX("UserPromptSubmit", { cwd: safeCwd(ctx), raw: { hook: "agent_start" } });
    } catch {
    }
  });

  // agent_end still allows auto-retry/compaction/queued follow-ups: only
  // agent_settled means pi will not continue automatically.
  pi.on("agent_settled", async (_event, ctx) => {
    try {
      await postToJanusX("Stop", { cwd: safeCwd(ctx), raw: { hook: "agent_settled" } });
    } catch {
    }
  });

  // ui_prompt_* exist so hosts can report "waiting for user" instead of
  // "running": confirm maps to approval, every other kind to input.
  pi.on("ui_prompt_start", async (event, ctx) => {
    try {
      const kind = event && typeof event.kind === "string" ? event.kind : "confirm";
      if (kind === "confirm") {
        await postToJanusX("PermissionRequest", {
          cwd: safeCwd(ctx),
          message: safeTitle(event),
          raw: { hook: "ui_prompt_start", matcher: "permission_prompt", kind },
        });
      } else {
        await postToJanusX("Notification", {
          cwd: safeCwd(ctx),
          message: safeTitle(event),
          raw: { hook: "ui_prompt_start", matcher: "idle_prompt", kind },
        });
      }
    } catch {
    }
  });

  pi.on("after_provider_response", async (event, ctx) => {
    try {
      const status = event && typeof event.status === "number" ? event.status : undefined;
      if (status === 429 || (status !== undefined && status >= 500 && status <= 599)) {
        await postToJanusX("janusx.turn.api-error", {
          cwd: safeCwd(ctx),
          message: "pi provider responded " + status,
          raw: { hook: "after_provider_response", status },
        });
      }
    } catch {
    }
  });
}
`
}

function buildWindowsHookScript(): string {
  return `param(
  [Parameter(Mandatory = $true)][string]$Source,
  [Alias("Event")][Parameter(Mandatory = $true)][string]$EventName,
  [string]$Marker = "${JANUSX_HOOK_COMMAND_MARKER}",
  [string]$Matcher = ""
)

$ErrorActionPreference = "Stop"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = $utf8NoBom
[Console]::InputEncoding = $utf8NoBom
[Console]::OutputEncoding = $utf8NoBom

function Write-Diagnostic($Status, $Detail) {
  try {
    $diagnosticPath = Join-Path $PSScriptRoot "janusx-agent-hook-last.json"
    $diagnostic = [ordered]@{
      source = $Source
      event = $EventName
      status = $Status
      detail = $Detail
      hasPort = -not [string]::IsNullOrWhiteSpace($env:JANUSX_HOOK_PORT)
      hasToken = -not [string]::IsNullOrWhiteSpace($env:JANUSX_HOOK_TOKEN)
      terminalId = $env:JANUSX_HOOK_TERMINAL_ID
      workspaceId = $env:JANUSX_HOOK_WORKSPACE_ID
      timestamp = (Get-Date).ToUniversalTime().ToString("o")
    }
    $diagnostic | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $diagnosticPath -Encoding UTF8
  } catch {
  }
}

function Get-FirstString($Value, [string[]]$Names) {
  if ($null -eq $Value -or $Value -is [string]) { return $null }
  $propertyNames = $Value.PSObject.Properties.Name
  foreach ($name in $Names) {
    if ($propertyNames -contains $name) {
      $candidate = $Value.$name
      if ($candidate -is [string] -and -not [string]::IsNullOrWhiteSpace($candidate)) {
        return $candidate
      }
    }
  }
  return $null
}

try {
  $port = $env:JANUSX_HOOK_PORT
  $token = $env:JANUSX_HOOK_TOKEN
  if ([string]::IsNullOrWhiteSpace($port) -or [string]::IsNullOrWhiteSpace($token)) {
    Write-Diagnostic "missing-env" "JANUSX_HOOK_PORT or JANUSX_HOOK_TOKEN is empty"
    exit 0
  }

  $stdinRaw = [Console]::In.ReadToEnd()
  $rawValue = $null
  if (-not [string]::IsNullOrWhiteSpace($stdinRaw)) {
    try {
      $rawValue = $stdinRaw | ConvertFrom-Json
    } catch {
      $rawValue = $stdinRaw
    }
  }

  $message = Get-FirstString $rawValue @("message", "prompt", "notification", "reason", "last_assistant_message")
  if (-not $message -and $null -ne $rawValue -and $rawValue -isnot [string]) {
    $propertyNames = $rawValue.PSObject.Properties.Name
    if ($propertyNames -contains "tool_input") {
      $message = Get-FirstString $rawValue.tool_input @("prompt", "description", "task")
    }
  }

  $sessionId = Get-FirstString $rawValue @("session_id", "sessionId")
  # Toast/excerpt text never needs more than a head: tool prompts can carry
  # tens of KB that would otherwise ride every POST body inside 'message'.
  if ($message -and $message.Length -gt 2000) { $message = $message.Substring(0, 2000) }

  # Coordinator only reads a handful of raw keys (status/state for opencode
  # rules, matcher/type fallbacks, transcript paths) — never forward the full
  # stdin object: tool_input/tool_response can carry megabytes of file or
  # command text that only slow down serialization and the POST body.
  $rawFiltered = [ordered]@{}
  if ($null -ne $rawValue -and $rawValue -isnot [string]) {
    foreach ($name in @("status", "state", "matcher", "notification_type", "type", "transcript_path", "transcriptPath", "session_id", "sessionId")) {
      try {
        if ($rawValue.PSObject.Properties.Name -contains $name) {
          $candidate = $rawValue.$name
          if ($candidate -is [string] -and -not [string]::IsNullOrWhiteSpace($candidate)) {
            if ($candidate.Length -gt 4096) { $candidate = $candidate.Substring(0, 4096) }
            $rawFiltered[$name] = $candidate
          }
        }
      } catch {
      }
    }
    try {
      $rawProps = $rawValue.properties
      if ($null -ne $rawProps -and $rawProps -isnot [string] -and $rawProps.PSObject.Properties.Name -contains "status") {
        $propsStatus = $rawProps.status
        if ($propsStatus -is [string] -and -not [string]::IsNullOrWhiteSpace($propsStatus)) {
          $rawFiltered["properties"] = [ordered]@{ status = $propsStatus }
        }
      }
    } catch {
    }
  }

  $payload = [ordered]@{
    source = $Source
    event = $EventName
    terminalId = $env:JANUSX_HOOK_TERMINAL_ID
    workspaceId = $env:JANUSX_HOOK_WORKSPACE_ID
    sessionId = $sessionId
    cwd = (Get-Location).Path
    message = $message
    timestamp = (Get-Date).ToUniversalTime().ToString("o")
    matcher = $Matcher
    raw = $rawFiltered
  }

  $json = $payload | ConvertTo-Json -Depth 10 -Compress
  $bodyBytes = $utf8NoBom.GetBytes($json)
  $headers = @{ Authorization = "Bearer $token" }
  # Never stall the agent: a stale JANUSX_HOOK_PORT (app restarted, terminal
  # kept) must fail fast instead of blocking the turn on the default 100s timeout.
  Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$port/api/agent-hook" -Headers $headers -ContentType "application/json; charset=utf-8" -Body $bodyBytes -TimeoutSec 2 | Out-Null
  Write-Diagnostic "posted" "ok"
} catch {
  Write-Diagnostic "error" $_.Exception.Message
}

exit 0
`
}

export class AgentHookConfigManager {
  private readonly platform: NodeJS.Platform
  private readonly homeDir: string
  private readonly userDataDir: string
  private readonly executablePath: string
  private readonly appEntryArg?: string
  private readonly configuredWindowsHookScriptPath?: string
  private readonly configuredWindowsHookRunnerPath?: string | null
  private readonly compileHookRunner: boolean

  constructor(options: AgentHookConfigManagerOptions = {}) {
    this.platform = options.platform ?? process.platform
    this.homeDir = options.homeDir ?? homedir()
    this.userDataDir = options.userDataDir ?? join(app.getPath('userData'), 'janusx')
    this.executablePath = options.executablePath ?? process.execPath
    this.appEntryArg = resolveAppEntryArg(options.appEntryArg)
    this.configuredWindowsHookScriptPath = options.windowsHookScriptPath
    this.configuredWindowsHookRunnerPath = options.windowsHookRunnerPath
    this.compileHookRunner = options.compileHookRunner ?? true
  }

  async ensureInstalled(engine: HookableEngine): Promise<HookInstallResult> {
    // janus emits hook events from its own CLI (env-gated, no files to install).
    if (engine === 'janus') {
      return { engine, installed: true, path: this.getHooksRootDir() }
    }

    // dsh has no hook contract yet (phase 1 = bare PTY via `dsh --profile dsh-tui`,
    // see .agents/notes/dsh-integration.md): no-op so a dsh launch never
    // touches the opencode plugin dir as a side effect.
    if (engine === 'dsh') {
      return { engine, installed: true, path: this.getHooksRootDir() }
    }

    if (engine === 'pi') {
      await this.ensurePiExtension()
      return { engine, installed: true, path: this.getPiExtensionPath() }
    }

    if (engine === 'claude') {
      const windowsHookScriptPath = await this.ensureHookClientScript()
      const windowsHookRunnerPath = await this.ensureHookRunner()
      return installJsonHooks(
        this.getClaudeSettingsPath(),
        CLAUDE_HOOKS,
        this.platform,
        this.executablePath,
        this.appEntryArg,
        engine,
        windowsHookScriptPath,
        windowsHookRunnerPath,
      )
    }

    if (engine === 'codex') {
      const windowsHookScriptPath = await this.ensureHookClientScript()
      const windowsHookRunnerPath = await this.ensureHookRunner()
      const result = await installJsonHooks(
        this.getCodexHooksPath(),
        CODEX_HOOKS,
        this.platform,
        this.executablePath,
        this.appEntryArg,
        engine,
        windowsHookScriptPath,
        windowsHookRunnerPath,
      )
      return result
    }

    await this.ensureOpencodePlugin()
    return { engine, installed: true, path: this.getOpencodeConfigDir() }
  }

  async uninstall(engine: HookableEngine): Promise<HookInstallResult> {
    if (engine === 'janus') {
      return { engine, installed: false, path: this.getHooksRootDir() }
    }

    // dsh owns no hook files (see ensureInstalled): uninstall is a no-op.
    if (engine === 'dsh') {
      return { engine, installed: false, path: this.getHooksRootDir() }
    }

    if (engine === 'pi') {
      const extensionPath = this.getPiExtensionPath()
      try {
        await rm(extensionPath, { force: true })
      } catch {
        // Best effort: a missing file is already uninstalled.
      }
      return { engine, installed: false, path: extensionPath }
    }

    if (engine === 'claude') {
      return uninstallJsonHooks(this.getClaudeSettingsPath(), engine)
    }

    if (engine === 'codex') {
      return uninstallJsonHooks(this.getCodexHooksPath(), engine)
    }

    return { engine, installed: false, path: this.getOpencodeConfigDir() }
  }

  async isInstalled(engine: HookableEngine): Promise<boolean> {
    if (engine === 'janus') return true

    // dsh has no installable hook surface yet: always report installed so
    // terminal creation never falls through to the opencode plugin path.
    if (engine === 'dsh') return true

    if (engine === 'pi') {
      try {
        await access(this.getPiExtensionPath())
        return true
      } catch {
        return false
      }
    }

    if (engine === 'opencode') {
      return Promise.all([
        access(join(this.getOpencodeConfigDir(), 'opencode.json')),
        access(join(this.getOpencodeConfigDir(), 'janusx-agent-hook-marker.json')),
      ]).then(() => true, () => false)
    }

    if (this.platform === 'win32') {
      try {
        await access(this.getWindowsHookScriptPath())
      } catch {
        return false
      }
    }

    try {
      const specs = engine === 'claude' ? CLAUDE_HOOKS : CODEX_HOOKS
      const runnerPath = await this.resolveInstalledRunner()
      const settings = await readJsonObject(engine === 'claude' ? this.getClaudeSettingsPath() : this.getCodexHooksPath())
      return specs.every((spec) => {
        const commands = toArray(getObject(settings.hooks)?.[spec.event])
          .flatMap((entry) => toArray(getObject(entry)?.hooks))
          .map((hook) => getObject(hook)?.command)
          .filter((command): command is string => typeof command === 'string')
        return commands.includes(buildHookCommand(
          this.platform,
          this.executablePath,
          this.appEntryArg,
          engine,
          spec.event,
          this.platform === 'win32' ? this.getWindowsHookScriptPath() : undefined,
          spec.matcher,
          runnerPath,
        ))
      })
    } catch {
      return false
    }
  }

  buildTerminalEnv(input: TerminalHookEnvInput, bridgeEnv: AgentHookBridgeEnv): Record<string, string> {
    const env: Record<string, string> = {
      ...bridgeEnv,
      JANUSX_HOOK_TERMINAL_ID: input.terminalId,
      JANUSX_HOOK_WORKSPACE_ID: input.workspaceId,
      JANUSX_HOOK_ENGINE: input.engine,
    }

    if (input.engine === 'opencode') {
      env.OPENCODE_CONFIG_DIR = this.getOpencodeConfigDir()
    }

    if (this.platform === 'win32') {
      const forwarded = [
        'JANUSX_HOOK_PORT',
        'JANUSX_HOOK_TOKEN',
        'JANUSX_HOOK_TERMINAL_ID',
        'JANUSX_HOOK_WORKSPACE_ID',
        'JANUSX_HOOK_ENGINE',
      ]
      if (input.engine === 'opencode') forwarded.push('OPENCODE_CONFIG_DIR/p')
      env.WSLENV = mergeWslenv(process.env.WSLENV, forwarded)
    }

    return env
  }

  getClaudeSettingsPath(): string {
    return join(this.homeDir, '.claude', 'settings.json')
  }

  getCodexHooksPath(): string {
    return join(this.homeDir, '.codex', 'hooks.json')
  }

  getOpencodeConfigDir(): string {
    return join(this.userDataDir, 'hooks', 'opencode')
  }

  getHooksRootDir(): string {
    return join(this.userDataDir, 'hooks')
  }

  getPiExtensionPath(): string {
    return join(this.userDataDir, 'hooks', 'pi', 'janusx-notify.js')
  }

  getWindowsHookScriptPath(): string {
    return this.configuredWindowsHookScriptPath ?? join(this.homeDir, '.janusx', 'hooks', 'janusx-agent-hook.ps1')
  }

  /**
   * Resolved GUI-subsystem launcher path, or null when the runner is
   * disabled (explicit null) or the platform is not Windows.
   */
  getHookRunnerPath(): string | null {
    if (this.platform !== 'win32') return null
    if (this.configuredWindowsHookRunnerPath === null) return null
    return this.configuredWindowsHookRunnerPath ?? join(this.homeDir, '.janusx', 'hooks', WINDOWS_HOOK_RUNNER_FILE_NAME)
  }

  /** Installed runner by existence only — never compiles (used by isInstalled). */
  private async resolveInstalledRunner(): Promise<string | undefined> {
    const runnerPath = this.getHookRunnerPath()
    if (!runnerPath) return undefined
    try {
      await access(runnerPath)
      return runnerPath
    } catch {
      return undefined
    }
  }

  /**
   * Best-effort runner availability for installs: returns the exe when it
   * already exists, compiles it once when missing, and yields undefined on
   * any failure so installs fall back to the legacy powershell command.
   */
  private async ensureHookRunner(): Promise<string | undefined> {
    const runnerPath = this.getHookRunnerPath()
    if (!runnerPath) return undefined
    try {
      await access(runnerPath)
      return runnerPath
    } catch {
      // Missing: compile below when allowed.
    }
    if (!this.compileHookRunner) return undefined
    try {
      await this.compileHookRunnerBinary(runnerPath)
      await access(runnerPath)
      return runnerPath
    } catch {
      return undefined
    }
  }

  private async compileHookRunnerBinary(runnerPath: string): Promise<void> {
    const sourcePath = runnerPath.replace(/\.exe$/i, '.cs')
    await mkdir(dirname(runnerPath), { recursive: true })
    await writeFile(sourcePath, buildHookRunnerSource(), 'utf8')
    // One-time cost: Add-Type shells out to the framework C# compiler.
    // Hidden like every other JanusX spawn; hook-time flashing is unaffected.
    const quote = (value: string): string => `'${value.replace(/'/g, "''")}'`
    await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `Add-Type -Path ${quote(sourcePath)} -OutputAssembly ${quote(runnerPath)} -OutputType WindowsApplication`,
    ], { windowsHide: true, timeout: 120000 })
  }

  private async ensureHookClientScript(): Promise<string | undefined> {
    if (this.platform !== 'win32') return undefined

    const scriptPath = this.getWindowsHookScriptPath()
    await mkdir(dirname(scriptPath), { recursive: true })
    await writeFile(scriptPath, buildWindowsHookScript(), 'utf8')
    return scriptPath
  }

  private async ensurePiExtension(): Promise<void> {
    // Flag-injected (--extension), never merged into the user's pi settings:
    // the file is JanusX-owned and rewritten idempotently on every install.
    const extensionPath = this.getPiExtensionPath()
    await mkdir(dirname(extensionPath), { recursive: true })
    await writeFile(extensionPath, buildPiExtension(), 'utf8')
  }

  private async ensureOpencodePlugin(): Promise<void> {
    const configDir = this.getOpencodeConfigDir()
    const pluginDir = join(configDir, 'plugins')
    await mkdir(pluginDir, { recursive: true })
    await writeFile(
      join(configDir, 'opencode.json'),
      `${JSON.stringify({ $schema: 'https://opencode.ai/config.json' }, null, 2)}\n`,
      'utf8',
    )
    await writeFile(
      join(configDir, 'janusx-agent-hook-marker.json'),
      `${JSON.stringify({ owner: 'JanusX', marker: JANUSX_HOOK_COMMAND_MARKER }, null, 2)}\n`,
      'utf8',
    )
    await writeFile(join(pluginDir, 'janusx-notify.js'), buildOpencodePlugin(), 'utf8')
  }
}
