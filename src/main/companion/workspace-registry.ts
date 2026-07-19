import { readFile, realpath, readdir, stat } from 'fs/promises'
import { join } from 'path'

export interface RegisteredWorkspace { id: string; name: string; path: string }
const VALID_ID = /^[a-zA-Z0-9_-]{1,128}$/

export async function resolveRegisteredWorkspace(root: string, id: string): Promise<RegisteredWorkspace> {
  if (!VALID_ID.test(id)) throw new Error('Invalid workspace id')
  const item = JSON.parse(await readFile(join(root, `${id}.json`), 'utf8')) as RegisteredWorkspace
  if (item.id !== id || !item.name || !item.path) throw new Error('Invalid registered workspace')
  const path = await realpath(item.path)
  if (!(await stat(path)).isDirectory()) throw new Error('Invalid workspace directory')
  return { ...item, path }
}

export async function listRegisteredWorkspaces(root: string): Promise<RegisteredWorkspace[]> {
  const files = await readdir(root).catch(() => [])
  const records = await Promise.all(files.filter((file) => file.endsWith('.json')).map(async (file) => {
    const id = file.slice(0, -5)
    try { return await resolveRegisteredWorkspace(root, id) } catch { return null }
  }))
  return records.filter((item): item is RegisteredWorkspace => Boolean(item))
}
