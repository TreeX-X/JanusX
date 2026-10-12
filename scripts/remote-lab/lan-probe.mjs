// LAN reachability probe for the remote lab. WebRTC traversal cannot be judged before the phone can reach the
// host at all, and "negotiation arrived but no candidate pair" looks identical whether the cause is router
// isolation, a firewall, a different subnet or ICE itself. Opening this page from the phone separates them:
// it answers over TCP and reports the client address as the host sees it, which also reveals whether both
// devices share a subnet. TCP reaching the host does not prove UDP does, so a pass here moves the question to
// mDNS and ICE rather than closing it.
import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'

const requested = process.argv.find(arg => arg.startsWith('--port='))
const port = requested ? Number(requested.split('=')[1]) : 41880
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid LAN probe port')

const localAddresses = Object.values(networkInterfaces()).flat().filter(entry => entry && !entry.internal && entry.family === 'IPv4').map(entry => entry.address)

const server = createServer((req, res) => {
  const seen = String(req.socket.remoteAddress ?? 'unknown').replace(/^::ffff:/, '')
  const sameSubnet = localAddresses.some(address => address.split('.').slice(0, 3).join('.') === seen.split('.').slice(0, 3).join('.'))
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
  res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LAN check</title>
<body style="font:16px/1.7 system-ui,sans-serif;padding:24px;max-width:34em">
<h1>局域网连通性检查</h1>
<p>主机看到你的地址是：<strong style="font-size:1.4em">${seen}</strong></p>
<p>与主机同一网段：<strong>${sameSubnet ? '是' : '否 —— 手机和电脑不在同一网段，WebRTC 无法走 host 候选直连'}</strong></p>
<p>你的设备：${String(req.headers['user-agent'] ?? '未知').slice(0, 160)}</p>
<p style="margin-top:2em;padding:12px;border:1px solid #ccc;border-radius:8px">
能看到这一页，说明手机到电脑的 <strong>TCP</strong> 路径是通的，WebRTC 的问题就转向 UDP、mDNS 或 ICE 层面。<br>
看不到这一页，说明路由器隔离、防火墙或网段不同，先解决这个再测 WebRTC。
</p></body>`)
})

server.listen(port, '0.0.0.0', () => {
  console.log('LAN probe listening on 0.0.0.0:' + port)
  console.log('Host IPv4 addresses: ' + (localAddresses.join(', ') || 'none found'))
  for (const address of localAddresses) console.log('  open on the phone: http://' + address + ':' + port + '/')
  console.log('Windows Firewall may prompt once; allow it for private networks. Close this window when done.')
})
