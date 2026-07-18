import { createHash, randomUUID } from 'crypto'
import { appendFile, mkdir, readFile, rename, writeFile } from 'fs/promises'
import { dirname } from 'path'
import type { CompanionCommand, CompanionRequestContext, CompanionResult } from './contracts'

export interface CompanionAuditRecord {
  auditId: string
  phase: 'intent' | 'outcome'
  actor: string
  provider: string
  chatId: string
  threadId?: string
  targetTerminalId?: string
  command: CompanionCommand['type']
  decision: 'pending' | 'allow' | 'deny'
  timestamp: number
  outcome: 'pending' | CompanionResult['code']
  prompt?: { preview: string; hash: string; length: number }
}

export class CompanionAuditStore {
  private queue = Promise.resolve()

  constructor(
    private readonly filePath: string,
    private readonly retentionMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  async begin(context: CompanionRequestContext, command: CompanionCommand): Promise<string> {
    const auditId = randomUUID()
    await this.append({
      auditId,
      phase: 'intent',
      actor: context.operatorOpenId,
      provider: context.provider,
      chatId: context.chatId,
      threadId: context.threadId,
      command: command.type,
      decision: 'pending',
      timestamp: this.now(),
      outcome: 'pending',
      ...(command.type === 'follow-up' ? { prompt: summarizePrompt(command.text) } : {}),
    })
    return auditId
  }

  async complete(
    auditId: string,
    context: CompanionRequestContext,
    command: CompanionCommand,
    result: CompanionResult,
  ): Promise<void> {
    await this.append({
      auditId,
      phase: 'outcome',
      actor: context.operatorOpenId,
      provider: context.provider,
      chatId: context.chatId,
      threadId: context.threadId,
      targetTerminalId: result.targetTerminalId,
      command: command.type,
      decision: result.ok ? 'allow' : 'deny',
      timestamp: this.now(),
      outcome: result.code,
      ...(command.type === 'follow-up' ? { prompt: summarizePrompt(command.text) } : {}),
    })
  }

  async record(context: CompanionRequestContext, command: CompanionCommand, result: CompanionResult): Promise<void> {
    const auditId = await this.begin(context, command)
    await this.complete(auditId, context, command, result)
  }

  private append(record: CompanionAuditRecord): Promise<void> {
    return this.exclusive(async () => {
      await mkdir(dirname(this.filePath), { recursive: true })
      await this.prune()
      await appendFile(this.filePath, `${JSON.stringify(record)}\n`, { mode: 0o600 })
    })
  }

  private async prune(): Promise<void> {
    try {
      const lines = (await readFile(this.filePath, 'utf8')).split('\n').filter(Boolean)
      const cutoff = this.now() - this.retentionMs
      const retained = lines.filter((line) => {
        try { return (JSON.parse(line) as CompanionAuditRecord).timestamp >= cutoff } catch { return false }
      })
      if (retained.length !== lines.length) {
        const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`
        await writeFile(temporaryPath, retained.length ? `${retained.join('\n')}\n` : '', { mode: 0o600 })
        await rename(temporaryPath, this.filePath)
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation)
    this.queue = result.then(() => undefined, () => undefined)
    return result
  }
}

function summarizePrompt(text: string): CompanionAuditRecord['prompt'] {
  return {
    preview: text.replace(/\s+/g, ' ').trim().slice(0, 80),
    hash: createHash('sha256').update(text).digest('hex'),
    length: text.length,
  }
}
