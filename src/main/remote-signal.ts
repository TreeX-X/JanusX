import { startSignaling } from './remote/signaling'
const service = await startSignaling(Number(process.env.PORT || 43821), process.env.LISTEN || '127.0.0.1')
console.log(`JanusX SDP/ICE signaling on ${service.port}; expose /signal through a TLS reverse proxy for wss://`)
process.once('SIGINT', () => { void service.close() })
process.once('SIGTERM', () => { void service.close() })
