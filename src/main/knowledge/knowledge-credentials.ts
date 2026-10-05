import { app, safeStorage } from 'electron'
import { readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { writeFileAtomic } from '../lib/atomic-file'

const credentialPath = () => join(app.getPath('userData'), 'janusx', 'knowledge-jev.credential')
export async function getJevKey(): Promise<string | null> {
  let encrypted: Buffer
  try { encrypted = await readFile(credentialPath()) } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw new Error('credential-unavailable')
  }
  if (!safeStorage?.isEncryptionAvailable()) throw new Error('credential-encryption-unavailable')
  try { return safeStorage.decryptString(encrypted) } catch { throw new Error('credential-unavailable') }
}
export async function setJevKey(input: unknown): Promise<void> {
  if (typeof input !== 'string' || input.length > 8192) throw new Error('invalid-credential')
  const key = input.trim()
  if (!key) {
    await unlink(credentialPath()).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('credential-unavailable') })
    return
  }
  if (!safeStorage?.isEncryptionAvailable()) throw new Error('credential-encryption-unavailable')
  await writeFileAtomic(credentialPath(), safeStorage.encryptString(key))
}
