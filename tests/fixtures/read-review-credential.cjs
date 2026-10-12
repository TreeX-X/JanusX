// Live-test helper only. Parent captures stdout in memory; never run directly in a terminal.
const { app, safeStorage } = require('electron')
const { readFileSync } = require('node:fs')
app.whenReady().then(() => {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Encryption unavailable')
  const key = safeStorage.decryptString(readFileSync(process.argv[2]))
  process.stdout.write(JSON.stringify({ key }))
  app.exit(0)
}).catch(() => { process.stderr.write('Credential unavailable'); app.exit(1) })
