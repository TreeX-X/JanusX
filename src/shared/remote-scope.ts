// Set by electron-vite for both main and renderer; unbundled tests use develop.
declare const __JANUSX_REMOTE_SCOPE__: 'lan' | 'develop' | undefined
export const REMOTE_LAN_ONLY = typeof __JANUSX_REMOTE_SCOPE__ !== 'undefined' && __JANUSX_REMOTE_SCOPE__ === 'lan'
export const REMOTE_SETTINGS_PREFIX = REMOTE_LAN_ONLY ? 'remote.lan.' : 'remote.'
