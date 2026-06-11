import { createHash } from 'crypto'
import { readFile, writeFile, mkdir, access } from 'fs/promises'
import { join } from 'path'

export class BlobStore {
  private basePath: string

  constructor(basePath: string) {
    this.basePath = basePath
  }

  async initialize(): Promise<void> {
    await mkdir(this.basePath, { recursive: true })
  }

  async store(content: Buffer): Promise<string> {
    const hash = createHash('sha1').update(content).digest('hex')
    const filePath = join(this.basePath, hash)
    try {
      await access(filePath)
      // File exists, skip write (dedup)
    } catch {
      await writeFile(filePath, content)
    }
    return hash
  }

  async retrieve(hash: string): Promise<Buffer | null> {
    try {
      return await readFile(join(this.basePath, hash))
    } catch {
      return null
    }
  }

  async exists(hash: string): Promise<boolean> {
    try {
      await access(join(this.basePath, hash))
      return true
    } catch {
      return false
    }
  }
}
