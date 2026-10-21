// Minimal STUN binding probe (RFC 5389). The remote lab records only candidate types, never addresses, so a failed
// cross-network run cannot tell "this host has no usable public address" from "it has one the peer cannot reach".
// A binding response proves reachability of this STUN destination only. Even a public mapping does not rule out
// CGNAT or describe peer filtering. A shared address does not classify every potential IPv4/IPv6 peer path.
// This diagnostic sends one UDP packet and prints no terminal data.
import { createSocket } from 'node:dgram'
import { lookup } from 'node:dns/promises'

const requested = process.argv.find(arg => arg.startsWith('--stun='))
const server = requested ? requested.split('=')[1] : 'stun:stun.l.google.com:19302'
const parsed = server.match(/^stun:([^:]+):(\d+)$/)
if (!parsed) throw new Error('Expected --stun=stun:host:port')
const [, host, port] = parsed
const addresses = [(await lookup(host, { family: 4 })).address]

const socket = createSocket('udp4')
const transaction = Buffer.alloc(12)
for (let index = 0; index < 12; index++) transaction[index] = Math.floor(Math.random() * 256)
const request = Buffer.concat([Buffer.from([0x00, 0x01, 0x00, 0x00]), Buffer.from([0x21, 0x12, 0xa4, 0x42]), transaction])

const finish = (code, message) => { clearTimeout(timer); socket.close(); if (message) console.log(message); if (code) process.exitCode = code }
const timer = setTimeout(() => finish(1, 'No STUN response from ' + server + ' within 5s.'), 5000)
socket.on('message', message => {
  if (message.length < 20 || !message.subarray(8, 20).equals(transaction)) return finish(1, 'Malformed STUN response.')
  if (message.readUInt16BE(0) !== 0x0101) return finish(1, 'STUN error response code 0x' + message.readUInt16BE(0).toString(16) + '.')
  let offset = 20, printed = false
  while (offset + 4 <= message.length) {
    const type = message.readUInt16BE(offset), length = message.readUInt16BE(offset + 2)
    const value = message.subarray(offset + 4, offset + 4 + length)
    if (type === 0x0020 && length >= 8 && value[1] === 0x01 && !printed) {
      printed = true
      const mappedPort = value.readUInt16BE(2) ^ 0x2112
      const octets = [...value.subarray(4, 8)].map((byte, index) => byte ^ [0x21, 0x12, 0xa4, 0x42][index])
      const address = octets.join('.')
      const shared = octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127
      console.log('STUN server       : ' + server + ' (' + addresses[0] + ')')
      console.log('Mapped address    : ' + address + ':' + mappedPort)
      console.log('Shared CGNAT space: ' + (shared
        ? 'YES (100.64.0.0/10). This mapping is not globally routable; inspect actual peer paths, including IPv6.'
        : 'no. This does not rule out CGNAT, endpoint-dependent mappings or peer filtering.'))
      console.log('Scope            : STUN binding only; not a NAT classification or proof of UDP P2P connectivity.')
    }
    offset += 4 + length + ((4 - (length % 4)) % 4)
  }
  finish(printed ? 0 : 1, printed ? null : 'No XOR-MAPPED-ADDRESS attribute in the response.')
})
socket.send(request, Number(port), addresses[0], error => { if (error) finish(1, 'Send failed: ' + error.message) })
