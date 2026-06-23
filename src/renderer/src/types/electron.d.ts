interface ElectronAPI {
  /*-- 同步平台信息，构造 xterm windowsPty 用 --*/
  platform: NodeJS.Platform
  windowsBuild?: number
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
  send: (channel: string, ...args: unknown[]) => void
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void
  janusPersona: string
}

declare global {
  interface Window {
    electron: ElectronAPI
  }
}

export {}
