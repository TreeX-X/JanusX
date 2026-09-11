import { create } from 'zustand'
import type {
  DiscoveredPeerView,
  PeerHostStatusView,
  RemoteCommand,
  RemoteTerminalInfo,
} from '../../../shared/ipc/remote'
import { remoteService } from '@/services/remote'
import { peerService } from '@/services/remote-peer'

export type RemoteStatus = 'disconnected' | 'connected'

/** 同一时间只保持一条控制连接（个人版 MVP 约束）：本机回环或双机其一。 */
export type RemoteLink = 'local' | 'peer'

export interface FingerprintPrompt {
  baseUrl: string
  fingerprint: string
  expectedDeviceId?: string
  name: string
}

interface RemoteStore {
  status: RemoteStatus
  /** 本机回环连上的被控设备（local 链路）。 */
  hostDeviceId: string | null
  /** 双机链路连上的被控设备。 */
  peerHostId: string | null
  peerName: string | null
  link: RemoteLink
  tenantId: string | null
  terminals: RemoteTerminalInfo[]
  activeTerminalId: string | null
  boundTerminalId: string | null
  tail: string
  tailSeq: number
  hostCode: string | null
  hostCodeExpiresAt: number | null
  /** 被控服务本机状态（mDNS 广播 + HTTPS 监听）。 */
  hostService: PeerHostStatusView
  discovered: DiscoveredPeerView[]
  discovering: boolean
  /** 指纹确认框：用户核对后再真正配对（TOFU）。 */
  fingerprintPrompt: FingerprintPrompt | null
  busy: boolean
  error: string | null
  /** 输配对码 → 连本机回环（单机演示/同机双开）。 */
  pair: (code: string) => Promise<boolean>
  disconnect: () => void
  refreshTerminals: () => Promise<void>
  selectTerminal: (terminalId: string) => Promise<void>
  refreshTail: () => Promise<void>
  /** 受控提交一行命令（走被控端 gateway 留痕）。 */
  sendLine: (text: string) => Promise<boolean>
  interrupt: () => Promise<boolean>
  /** 被控端：签发本机配对码，供另一台控制端输入。 */
  issueHostCode: () => Promise<boolean>
  clearError: () => void
  refreshHostStatus: () => Promise<void>
  startHostService: () => Promise<boolean>
  stopHostService: () => Promise<boolean>
  discoverPeers: () => Promise<void>
  /** 选中发现设备/填好手动地址后先弹指纹确认，不直接连。 */
  requestPeerPair: (target: FingerprintPrompt) => void
  cancelPeerPair: () => void
  /** 指纹确认后真正配对（双机链路）。 */
  pairPeer: (code: string) => Promise<boolean>
  forgetPeer: (hostDeviceId: string) => Promise<void>
  /** 面板挂载时调用：补一次被控状态 + 恢复输出轮询。 */
  resumePolling: () => void
}

/** 输出自动轮询（2s）：连接态常驻，断开即停；面板开关不影响。 */
let pollTimer: ReturnType<typeof setInterval> | null = null

function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

export const useRemoteStore = create<RemoteStore>((set, get) => {
  const ensurePolling = () => {
    if (pollTimer) return
    pollTimer = setInterval(() => {
      const state = get()
      if (state.status !== 'connected' || !state.activeTerminalId) return
      void get().refreshTail()
    }, 2000)
    const maybeUnref = pollTimer as unknown as { unref?: () => void }
    if (typeof maybeUnref.unref === 'function') maybeUnref.unref()
  }

  const resetConnection = () => ({
    status: 'disconnected' as const,
    hostDeviceId: null,
    peerHostId: null,
    peerName: null,
    link: 'local' as const,
    tenantId: null,
    terminals: [],
    activeTerminalId: null,
    boundTerminalId: null,
    tail: '',
    tailSeq: 0,
    error: null,
  })

  // 网关 follow-up/stop 需先 bind（单设备单绑定，切终端需重绑）。
  // tail 直读被控端回放，无需绑定。双机链路经 peerService 同语义透传。
  const execCommand = (command: RemoteCommand, opts?: { actionToken?: string }) => {
    const { link, peerHostId } = get()
    if (link === 'peer' && peerHostId) return peerService.execute(peerHostId, command, opts)
    return remoteService.execute(command, opts)
  }

  const ensureBound = async (terminalId: string): Promise<boolean> => {
    if (get().boundTerminalId === terminalId) return true
    try {
      const result = await execCommand({ type: 'bind', terminalId })
      if (!result.ok) {
        set({ error: result.error.message })
        return false
      }
      if (!result.value.ok) {
        set({ error: result.value.message })
        return false
      }
      set({ boundTerminalId: terminalId, error: null })
      return true
    } catch {
      set({ error: '远控服务不可用' })
      return false
    }
  }

  /** 会话失效类错误：直接断开并停轮询，提示重配对。 */
  const isAuthError = (code: string) =>
    code === 'signed-out' || code === 'forbidden'
    || code === 'stale-session' || code === 'invalid-session'

  return {
  status: 'disconnected',
  hostDeviceId: null,
  peerHostId: null,
  peerName: null,
  link: 'local',
  tenantId: null,
  terminals: [],
  activeTerminalId: null,
  boundTerminalId: null,
  tail: '',
  tailSeq: 0,
  hostCode: null,
  hostCodeExpiresAt: null,
  hostService: { running: false },
  discovered: [],
  discovering: false,
  fingerprintPrompt: null,
  busy: false,
  error: null,

  pair: async (code) => {
    const trimmed = code.trim()
    if (!trimmed) {
      set({ error: '请输入配对码' })
      return false
    }
    set({ busy: true, error: null })
    try {
      const result = await remoteService.redeemCode(trimmed)
      if (!result.ok) {
        set({ busy: false, error: result.error.message })
        return false
      }
      set({
        ...resetConnection(),
        status: 'connected',
        link: 'local',
        hostDeviceId: result.value.hostDeviceId,
        tenantId: result.value.tenantId,
        busy: false,
      })
      await get().refreshTerminals()
      ensurePolling()
      return true
    } catch {
      set({ busy: false, error: '远控服务不可用' })
      return false
    }
  },

  disconnect: () => {
    const { link, peerHostId } = get()
    stopPolling()
    if (link === 'peer' && peerHostId) {
      // 主进程侧连接槽顺手释放，失败不打扰用户。
      peerService.disconnect(peerHostId).catch(() => undefined)
    }
    set(resetConnection())
  },

  refreshTerminals: async () => {
    const { status, link, peerHostId } = get()
    if (status !== 'connected') return
    try {
      const result = link === 'peer' && peerHostId
        ? await peerService.listTerminals(peerHostId)
        : await remoteService.listTerminals()
      if (!result.ok) {
        if (isAuthError(result.error.code)) {
          get().disconnect()
          set({ error: result.error.message })
          return
        }
        set({ error: result.error.message })
        return
      }
      const terminals = result.value
      const activeTerminalId = terminals.some((t) => t.terminalId === get().activeTerminalId)
        ? get().activeTerminalId
        : (terminals[0]?.terminalId ?? null)
      // 终端列表变化导致选中切换时，旧绑定已指向别处，清掉后自动重绑（用户无感）。
      const boundTerminalId = activeTerminalId === get().boundTerminalId ? get().boundTerminalId : null
      set({ terminals, activeTerminalId, boundTerminalId, error: null })
      if (activeTerminalId) await get().refreshTail()
      // 连接成功/列表刷新后直接预绑，首发命令零等待；失败仅提示，发送时再确保一次。
      if (activeTerminalId) await ensureBound(activeTerminalId)
    } catch {
      set({ error: '远控服务不可用' })
    }
  },

  selectTerminal: async (terminalId) => {
    set({ activeTerminalId: terminalId, tail: '', tailSeq: 0 })
    await get().refreshTail()
    // 预绑定，失败仅提示，真正发送时还会再确保一次。
    await ensureBound(terminalId)
  },

  refreshTail: async () => {
    const { status, link, peerHostId, activeTerminalId } = get()
    if (status !== 'connected' || !activeTerminalId) return
    try {
      const result = link === 'peer' && peerHostId
        ? await peerService.tail(peerHostId, activeTerminalId)
        : await remoteService.tail(activeTerminalId)
      if (!result.ok) {
        if (isAuthError(result.error.code)) {
          get().disconnect()
          set({ error: result.error.message })
          return
        }
        set({ error: result.error.message })
        return
      }
      set({ tail: result.value.data, tailSeq: result.value.seq, error: null })
    } catch {
      set({ error: '远控服务不可用' })
    }
  },

  sendLine: async (text) => {
    const { status, activeTerminalId } = get()
    const line = text.trim()
    if (status !== 'connected' || !activeTerminalId || !line) return false
    set({ busy: true, error: null })
    try {
      if (!(await ensureBound(activeTerminalId))) {
        set({ busy: false })
        return false
      }
      let result = await execCommand({ type: 'follow-up', text: line })
      if (!result.ok) {
        set({ busy: false, error: result.error.message })
        return false
      }
      if (!result.value.ok && (result.value.code === 'unbound' || result.value.code === 'expired-binding')) {
        // 绑定过期/丢失时重绑一次再试，避免首发必失败。
        set({ boundTerminalId: null })
        if (!(await ensureBound(activeTerminalId))) {
          set({ busy: false })
          return false
        }
        result = await execCommand({ type: 'follow-up', text: line })
        if (!result.ok) {
          set({ busy: false, error: result.error.message })
          return false
        }
      }
      if (!result.value.ok) {
        set({ busy: false, error: result.value.message })
        return false
      }
      set({ busy: false })
      await get().refreshTail()
      return true
    } catch {
      set({ busy: false, error: '远控服务不可用' })
      return false
    }
  },

  interrupt: async () => {
    const { status, activeTerminalId } = get()
    if (status !== 'connected' || !activeTerminalId) return false
    try {
      if (!(await ensureBound(activeTerminalId))) return false
      let result = await execCommand({ type: 'stop' })
      if (!result.ok) {
        set({ error: result.error.message })
        return false
      }
      if (!result.value.ok && (result.value.code === 'unbound' || result.value.code === 'expired-binding')) {
        set({ boundTerminalId: null })
        if (!(await ensureBound(activeTerminalId))) return false
        result = await execCommand({ type: 'stop' })
        if (!result.ok) {
          set({ error: result.error.message })
          return false
        }
      }
      if (!result.value.ok) {
        set({ error: result.value.message })
        return false
      }
      await get().refreshTail()
      return true
    } catch {
      set({ error: '远控服务不可用' })
      return false
    }
  },

  issueHostCode: async () => {
    set({ busy: true, error: null })
    try {
      const result = await remoteService.issueCode()
      if (!result.ok) {
        set({ busy: false, error: result.error.message })
        return false
      }
      set({
        hostCode: result.value.code,
        hostCodeExpiresAt: result.value.expiresAt,
        busy: false,
      })
      return true
    } catch {
      set({ busy: false, error: '远控服务不可用' })
      return false
    }
  },

  clearError: () => set({ error: null }),

  refreshHostStatus: async () => {
    try {
      const result = await peerService.hostStatus()
      if (result.ok) set({ hostService: result.value })
      else set({ error: result.error.message })
    } catch {
      set({ error: '远控服务不可用' })
    }
  },

  startHostService: async () => {
    set({ busy: true, error: null })
    try {
      const result = await peerService.startHost()
      if (!result.ok) {
        set({ busy: false, error: result.error.message })
        return false
      }
      set({ hostService: result.value, busy: false })
      return true
    } catch {
      set({ busy: false, error: '远控服务不可用' })
      return false
    }
  },

  stopHostService: async () => {
    try {
      await peerService.stopHost()
      set({ hostService: { running: false } })
      return true
    } catch {
      set({ error: '远控服务不可用' })
      return false
    }
  },

  discoverPeers: async () => {
    set({ discovering: true, error: null })
    try {
      const result = await peerService.discover(3000)
      if (result.ok) set({ discovered: result.value, discovering: false })
      else set({ discovering: false, error: result.error.message })
    } catch {
      set({ discovering: false, error: '远控服务不可用' })
    }
  },

  requestPeerPair: (target) => set({ fingerprintPrompt: target, error: null }),

  cancelPeerPair: () => set({ fingerprintPrompt: null }),

  pairPeer: async (code) => {
    const prompt = get().fingerprintPrompt
    const trimmed = code.trim()
    if (!prompt) {
      set({ error: '请先选择要连接的设备' })
      return false
    }
    if (!trimmed) {
      set({ error: '请输入配对码' })
      return false
    }
    set({ busy: true, error: null })
    try {
      const result = await peerService.pair(prompt.baseUrl, prompt.fingerprint, trimmed, prompt.expectedDeviceId)
      if (!result.ok) {
        // 指纹变化时提示可遗忘重认；配对码问题留在确认框重试。
        set({ busy: false, error: result.error.message })
        return false
      }
      set({
        ...resetConnection(),
        status: 'connected',
        link: 'peer',
        peerHostId: result.value.hostDeviceId,
        peerName: prompt.name,
        tenantId: result.value.tenantId,
        fingerprintPrompt: null,
        busy: false,
      })
      await get().refreshTerminals()
      ensurePolling()
      return true
    } catch {
      set({ busy: false, error: '远控服务不可用' })
      return false
    }
  },

  forgetPeer: async (hostDeviceId) => {
    try {
      await peerService.forget(hostDeviceId)
      if (get().peerHostId === hostDeviceId) get().disconnect()
      else set({ error: null })
    } catch {
      set({ error: '远控服务不可用' })
    }
  },

  resumePolling: () => {
    if (get().status === 'connected') ensurePolling()
    void get().refreshHostStatus()
  },
  }
})
