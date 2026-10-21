/** Shared by the local Node server and the Cloudflare signaling service. */
export function parseSignalJoin(message: any): { invite: string; role: 'host' | 'client' } {
  if (message?.type !== 'join' || typeof message.invite !== 'string'
    || !/^[a-f0-9]{48}$/.test(message.invite) || !['host', 'client'].includes(message.role)) throw Error('join')
  return { invite: message.invite, role: message.role }
}

/** Shape validation only: SDP authentication remains with the two endpoints. */
export function parseSignalMessage(message: any, role: 'host' | 'client'): { type: string; data: any } {
  const d = message?.data
  if (message?.type === 'candidate') {
    if (typeof d?.candidate !== 'string' || d.candidate.length > 4096 || !/ udp /i.test(d.candidate)
      || / typ relay(?: |$)/i.test(d.candidate) || !Number.isInteger(d.sdpMLineIndex) || typeof d.sdpMid !== 'string') throw Error('candidate')
    if (d.usernameFragment !== undefined && (typeof d.usernameFragment !== 'string' || d.usernameFragment.length > 256)) throw Error('generation')
    return { type: 'candidate', data: {
      candidate: d.candidate, sdpMLineIndex: d.sdpMLineIndex, sdpMid: d.sdpMid,
      ...(d.usernameFragment !== undefined ? { usernameFragment: d.usernameFragment } : {}),
    } }
  }
  if (message?.type !== (role === 'host' ? 'offer' : 'answer')) throw Error('only SDP/ICE allowed')
  if (d?.type !== message.type || typeof d.sdp !== 'string' || d.sdp.length > 100000
    || typeof d.mac !== 'string' || !/^[a-f0-9]{64}$/.test(d.mac)) throw Error('sdp')
  if (d.offerUfrag !== undefined && (typeof d.offerUfrag !== 'string' || d.offerUfrag.length > 256)) throw Error('generation')
  return { type: message.type, data: {
    type: d.type, sdp: d.sdp, mac: d.mac,
    ...(d.offerUfrag !== undefined ? { offerUfrag: d.offerUfrag } : {}),
  } }
}
