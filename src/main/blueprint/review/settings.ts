// Note: immediate settings persistence — see .agents/notes/blueprint/maintenance/note-content-review.md
import { readFile } from 'node:fs/promises'
import { blueprintReviewSettingsSchema, DEFAULT_BLUEPRINT_REVIEW_SETTINGS, type BlueprintReviewSettings } from '../../../shared/blueprint-review-settings'
import { SerialQueue, writeFileAtomic } from '../../lib/atomic-file'

export class ReviewSettingsStore {
  private readonly queue = new SerialQueue()
  constructor(readonly path: string) {}
  async read(): Promise<BlueprintReviewSettings> {
    try { return blueprintReviewSettingsSchema.parse(JSON.parse(await readFile(this.path, 'utf8'))) } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return structuredClone(DEFAULT_BLUEPRINT_REVIEW_SETTINGS)
      throw error
    }
  }
  update(input: unknown): Promise<BlueprintReviewSettings> {
    const settings = blueprintReviewSettingsSchema.parse(input)
    return this.queue.run(async () => {
      await writeFileAtomic(this.path, JSON.stringify(settings, null, 2) + '\n')
      return settings
    })
  }
}
