export function installElectronApiFallback(): void {
  if (window.electron) return

  window.electron = {
    platform: inferPlatform(),
    invoke: () => Promise.resolve(undefined),
    send: () => {},
    on: () => () => {},
    janusPersona: '',
  }
}

function inferPlatform(): NodeJS.Platform {
  const platform = navigator.platform.toLowerCase()
  if (platform.includes('win')) return 'win32'
  if (platform.includes('mac')) return 'darwin'
  if (platform.includes('linux')) return 'linux'
  return 'win32'
}
