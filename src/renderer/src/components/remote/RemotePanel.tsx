import { useEffect, useState } from 'react'
import { useI18n } from '@/i18n/useI18n'
import { useRemoteStore } from '@/stores/remote'
import { useTeamStore } from '@/stores/team'

/**
 * 同账号双机 LAN 远控面板（ToB M3→双机）。
 * 被控：开服务 → 发配对码（mDNS 广播 + HTTPS，5 分钟码）。
 * 控制：搜设备/手动地址 → 核对指纹 → 输码连 → 看输出（2s 自动刷）→ 发一行/中断。
 * 回环（本机配对码直连）保留作单机演示。
 */
export function RemotePanel() {
  const { t } = useI18n('team')
  const teamStatus = useTeamStore((s) => s.status)
  const requestLogin = useTeamStore((s) => s.requestLogin)
  const status = useRemoteStore((s) => s.status)
  const link = useRemoteStore((s) => s.link)
  const peerName = useRemoteStore((s) => s.peerName)
  const terminals = useRemoteStore((s) => s.terminals)
  const activeTerminalId = useRemoteStore((s) => s.activeTerminalId)
  const tail = useRemoteStore((s) => s.tail)
  const hostCode = useRemoteStore((s) => s.hostCode)
  const busy = useRemoteStore((s) => s.busy)
  const error = useRemoteStore((s) => s.error)
  const pair = useRemoteStore((s) => s.pair)
  const disconnect = useRemoteStore((s) => s.disconnect)
  const refreshTerminals = useRemoteStore((s) => s.refreshTerminals)
  const selectTerminal = useRemoteStore((s) => s.selectTerminal)
  const refreshTail = useRemoteStore((s) => s.refreshTail)
  const sendLine = useRemoteStore((s) => s.sendLine)
  const interrupt = useRemoteStore((s) => s.interrupt)
  const issueHostCode = useRemoteStore((s) => s.issueHostCode)
  const clearError = useRemoteStore((s) => s.clearError)
  const hostService = useRemoteStore((s) => s.hostService)
  const startHostService = useRemoteStore((s) => s.startHostService)
  const stopHostService = useRemoteStore((s) => s.stopHostService)
  const discovered = useRemoteStore((s) => s.discovered)
  const discovering = useRemoteStore((s) => s.discovering)
  const discoverPeers = useRemoteStore((s) => s.discoverPeers)
  const fingerprintPrompt = useRemoteStore((s) => s.fingerprintPrompt)
  const requestPeerPair = useRemoteStore((s) => s.requestPeerPair)
  const cancelPeerPair = useRemoteStore((s) => s.cancelPeerPair)
  const pairPeer = useRemoteStore((s) => s.pairPeer)
  const forgetPeer = useRemoteStore((s) => s.forgetPeer)
  const resumePolling = useRemoteStore((s) => s.resumePolling)

  const [code, setCode] = useState('')
  const [line, setLine] = useState('')
  const [manualAddr, setManualAddr] = useState('')
  const [manualFp, setManualFp] = useState('')
  const [peerCode, setPeerCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [forgotHint, setForgotHint] = useState(false)

  useEffect(() => {
    if (teamStatus === 'authed') resumePolling()
  }, [teamStatus, resumePolling])

  if (teamStatus !== 'authed') {
    return (
      <div className="p-2 text-[12px]" style={{ color: 'var(--shell-dim)' }}>
        <div className="mb-2">{t('team:remote.needLogin')}</div>
        <button
          type="button"
          onClick={() => requestLogin()}
          className="w-full rounded border border-white/10 px-2 py-1.5 text-[12px] font-semibold hover:bg-white/[0.06]"
        >
          {t('team:remote.goLogin')}
        </button>
      </div>
    )
  }

  const copyFingerprint = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      /* 剪贴板不可用时仍展示原文 */
    }
    setCopied(true)
  }

  return (
    <div className="flex flex-col gap-2 p-2 text-[12px]" style={{ color: 'var(--shell-text, #ddd)' }}>
      {error && (
        <button
          type="button"
          onClick={() => clearError()}
          title={error}
          className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-left text-[11px] text-red-300"
        >
          {error}
        </button>
      )}

      {/* 被控服务：mDNS 广播 + HTTPS 监听（双机远控总开关） */}
      <section className="rounded border border-white/10 p-2">
        <div className="mb-1 text-[11px] font-semibold" style={{ color: 'var(--shell-dim)' }}>{t('team:remote.hostServiceTitle')}</div>
        {hostService.running ? (
          <div className="flex flex-col gap-1">
            <div className="font-mono text-[11px]">
              {t('team:remote.hostAddress')}：{(hostService.addresses[0] ?? '127.0.0.1')}:{hostService.port}
            </div>
            <button
              type="button"
              title={hostService.fingerprint}
              onClick={() => void copyFingerprint(hostService.fingerprint)}
              className="truncate rounded bg-black/40 px-1.5 py-1 text-left font-mono text-[11px]"
            >
              {t('team:remote.hostFingerprint')}：{hostService.fingerprint.slice(0, 12)}…{copied ? t('team:remote.copied') : ''}
            </button>
            <button
              type="button"
              onClick={() => void stopHostService()}
              className="w-full rounded border border-white/10 px-2 py-1.5 font-semibold hover:bg-white/[0.06]"
            >
              {t('team:remote.stopHost')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void startHostService()}
            className="w-full rounded border border-white/10 px-2 py-1.5 font-semibold hover:bg-white/[0.06] disabled:opacity-50"
          >
            {t('team:remote.startHost')}
          </button>
        )}
      </section>

      {/* 被控端：签发本机配对码（回环演示与双机通用） */}
      <section className="rounded border border-white/10 p-2">
        <div className="mb-1 text-[11px] font-semibold" style={{ color: 'var(--shell-dim)' }}>{t('team:remote.hostTitle')}</div>
        {hostCode ? (
          <div className="font-mono text-[16px] font-bold tracking-widest">{hostCode}</div>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void issueHostCode()}
            className="w-full rounded border border-white/10 px-2 py-1.5 font-semibold hover:bg-white/[0.06] disabled:opacity-50"
          >
            {t('team:remote.issueCode')}
          </button>
        )}
      </section>

      {/* 控制端：输码连接 */}
      {status !== 'connected' ? (
        <>
          <section className="rounded border border-white/10 p-2">
            <div className="mb-1 text-[11px] font-semibold" style={{ color: 'var(--shell-dim)' }}>{t('team:remote.clientTitle')}</div>
            <div className="flex gap-1">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder={t('team:remote.codePlaceholder')}
                maxLength={16}
                className="min-w-0 flex-1 rounded border border-white/10 bg-transparent px-2 py-1.5 font-mono tracking-widest outline-none"
              />
              <button
                type="button"
                disabled={busy || !code.trim()}
                onClick={() => void pair(code).then((ok) => { if (ok) setCode('') })}
                className="shrink-0 rounded border border-white/10 px-3 py-1.5 font-semibold hover:bg-white/[0.06] disabled:opacity-50"
              >
                {t('team:remote.connect')}
              </button>
            </div>
          </section>

          {/* 双机：mDNS 发现 */}
          <section className="rounded border border-white/10 p-2">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-[11px] font-semibold" style={{ color: 'var(--shell-dim)' }}>LAN</span>
              <button
                type="button"
                disabled={discovering}
                onClick={() => void discoverPeers()}
                className="ml-auto text-[11px] underline disabled:opacity-50"
              >
                {discovering ? t('team:remote.discovering') : t('team:remote.discover')}
              </button>
            </div>
            {discovered.length === 0 ? (
              <div className="text-[11px]" style={{ color: 'var(--shell-dim)' }}>{t('team:remote.noPeers')}</div>
            ) : (
              <div className="flex max-h-24 flex-col gap-0.5 overflow-auto">
                {discovered.map((peer) => (
                  <div key={peer.deviceId} className="flex items-center gap-1 rounded px-1.5 py-1 hover:bg-white/[0.04]">
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px]" title={`${peer.host}:${peer.port} · ${peer.fingerprint}`}>
                      {peer.name} · {peer.host}:{peer.port}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setForgotHint(false)
                        requestPeerPair({
                          baseUrl: `https://${peer.host}:${peer.port}`,
                          fingerprint: peer.fingerprint,
                          expectedDeviceId: peer.deviceId,
                          name: peer.name,
                        })
                      }}
                      className="shrink-0 text-[11px] underline"
                    >
                      {t('team:remote.peerConnect')}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 双机：手动地址兜底 */}
          <section className="rounded border border-white/10 p-2">
            <div className="mb-1 text-[11px] font-semibold" style={{ color: 'var(--shell-dim)' }}>{t('team:remote.manualTitle')}</div>
            <div className="flex flex-col gap-1">
              <input
                value={manualAddr}
                onChange={(e) => setManualAddr(e.target.value)}
                placeholder={t('team:remote.addressPlaceholder')}
                className="min-w-0 rounded border border-white/10 bg-transparent px-2 py-1.5 font-mono text-[11px] outline-none"
              />
              <input
                value={manualFp}
                onChange={(e) => setManualFp(e.target.value)}
                placeholder={t('team:remote.fingerprintPlaceholder')}
                className="min-w-0 rounded border border-white/10 bg-transparent px-2 py-1.5 font-mono text-[11px] outline-none"
              />
              <button
                type="button"
                disabled={busy || !manualAddr.trim() || !manualFp.trim()}
                onClick={() => {
                  setForgotHint(false)
                  requestPeerPair({ baseUrl: manualAddr.trim(), fingerprint: manualFp.trim(), name: manualAddr.trim() })
                }}
                className="w-full rounded border border-white/10 px-2 py-1.5 font-semibold hover:bg-white/[0.06] disabled:opacity-50"
              >
                {t('team:remote.verifyAndConnect')}
              </button>
            </div>
          </section>

          {/* 指纹确认：用户核对后才真正配对 */}
          {fingerprintPrompt && (
            <section className="rounded border border-orange-500/40 bg-orange-500/[0.06] p-2">
              <div className="mb-1 text-[11px] font-semibold text-orange-300">{t('team:remote.fpTitle')}</div>
              <div className="mb-1 font-mono text-[11px]">
                {t('team:remote.fpDevice')}：{fingerprintPrompt.name}
              </div>
              <div className="mb-1 break-all rounded bg-black/40 p-1.5 font-mono text-[10px] leading-relaxed">
                {t('team:remote.fpValue')}：{fingerprintPrompt.fingerprint}
              </div>
              <div className="mb-1 text-[11px]" style={{ color: 'var(--shell-dim)' }}>{t('team:remote.fpHint')}</div>
              <div className="flex gap-1">
                <input
                  value={peerCode}
                  onChange={(e) => setPeerCode(e.target.value.toUpperCase())}
                  placeholder={t('team:remote.codePlaceholder')}
                  maxLength={16}
                  className="min-w-0 flex-1 rounded border border-white/10 bg-transparent px-2 py-1.5 font-mono tracking-widest outline-none"
                />
                <button
                  type="button"
                  disabled={busy || !peerCode.trim()}
                  onClick={() => void pairPeer(peerCode).then((ok) => { if (ok) { setPeerCode(''); setManualAddr(''); setManualFp('') } })}
                  className="shrink-0 rounded border border-white/10 px-3 py-1.5 font-semibold hover:bg-white/[0.06] disabled:opacity-50"
                >
                  {t('team:remote.fpConfirm')}
                </button>
                <button type="button" onClick={() => { cancelPeerPair(); setPeerCode('') }} className="shrink-0 text-[11px] underline">
                  {t('team:remote.fpCancel')}
                </button>
              </div>
              {fingerprintPrompt.expectedDeviceId && (
                <button
                  type="button"
                  onClick={() => void forgetPeer(fingerprintPrompt.expectedDeviceId!).then(() => { setForgotHint(true); cancelPeerPair(); setPeerCode('') })}
                  className="mt-1 text-[11px] underline"
                >
                  {t('team:remote.fpForget')}
                </button>
              )}
              {forgotHint && (
                <div className="mt-1 text-[11px]" style={{ color: 'var(--shell-dim)' }}>{t('team:remote.forgotten')}</div>
              )}
            </section>
          )}
        </>
      ) : (
        <section className="rounded border border-white/10 p-2">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-[11px] font-semibold" style={{ color: 'var(--shell-dim)' }}>
              {t('team:remote.connected')}{link === 'peer' && peerName ? ` · ${peerName}` : ''}
            </span>
            <button type="button" onClick={() => void refreshTerminals()} className="ml-auto text-[11px] underline">{t('team:remote.refresh')}</button>
            <button type="button" onClick={() => disconnect()} className="text-[11px] underline">{t('team:remote.disconnect')}</button>
          </div>
          {terminals.length === 0 ? (
            <div className="text-[11px]" style={{ color: 'var(--shell-dim)' }}>{t('team:remote.noTerminals')}</div>
          ) : (
            <div className="mb-1 flex max-h-24 flex-col gap-0.5 overflow-auto">
              {terminals.map((item) => (
                <button
                  key={item.terminalId}
                  type="button"
                  onClick={() => void selectTerminal(item.terminalId)}
                  className={`truncate rounded px-1.5 py-1 text-left font-mono text-[11px] ${
                    item.terminalId === activeTerminalId ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'
                  }`}
                  title={item.terminalId}
                >
                  {`${item.terminalId.slice(0, 8)} · ${item.engine}`}
                </button>
              ))}
            </div>
          )}
          <pre className="mb-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-black/40 p-1.5 font-mono text-[11px] leading-relaxed">
            {tail || t('team:remote.noOutput')}
          </pre>
          <div className="mb-1 flex gap-1">
            <button type="button" onClick={() => void refreshTail()} className="text-[11px] underline">{t('team:remote.refreshOutput')}</button>
            <span className="text-[10px]" style={{ color: 'var(--shell-dim)' }}>{t('team:remote.liveTail')}</span>
            <button type="button" onClick={() => void interrupt()} className="ml-auto text-[11px] underline">{t('team:remote.interrupt')}</button>
          </div>
          <div className="flex gap-1">
            <input
              value={line}
              onChange={(e) => setLine(e.target.value)}
              placeholder={t('team:remote.linePlaceholder')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void sendLine(line).then((ok) => { if (ok) setLine('') })
              }}
              className="min-w-0 flex-1 rounded border border-white/10 bg-transparent px-2 py-1.5 font-mono text-[11px] outline-none"
            />
            <button
              type="button"
              disabled={busy || !line.trim()}
              onClick={() => void sendLine(line).then((ok) => { if (ok) setLine('') })}
              className="shrink-0 rounded border border-white/10 px-3 py-1.5 font-semibold hover:bg-white/[0.06] disabled:opacity-50"
            >
              {t('team:remote.send')}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
