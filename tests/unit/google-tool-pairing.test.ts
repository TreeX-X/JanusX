import { describe, expect, it } from 'vitest'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { streamText } from 'ai'
import { z } from 'zod'
import { createVercelStream, runJanusAgentLoop, toVercelMessages } from '@janus-agent/agent-core'
import { withAiSdkV1StreamCompatibility } from '../../packages/llm-core/src/utils/stream-compat'

describe('Google tool result turns', () => {
  it('sends a complete result batch after multiple calls without repeating a write', async () => {
    const requests: any[] = []
    let writes = 0
    const google = createGoogleGenerativeAI({ apiKey: 'fixture', fetch: async (_url, init) => {
      const body = JSON.parse(init!.body as string)
      requests.push(body)
      const parts = requests.length === 1
        ? [{ functionCall: { name: 'note_read', args: {} } }, { functionCall: { name: 'note_write', args: {} } }]
        : [{ text: 'Updated' }]
      return new Response(`data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP' }] })}\n\n`, { headers: { 'content-type': 'text/event-stream' } })
    } })
    await runJanusAgentLoop([{ role: 'user', content: 'Update Note' }], {
      tools: [
        { name: 'note_read', executionMode: 'parallel', execute: async () => ({ content: 'Read' }) },
        { name: 'note_write', executionMode: 'sequential', execute: async () => { writes++; return { content: 'Applied' } } },
      ],
      stream: createVercelStream({ model: withAiSdkV1StreamCompatibility(google('gemini-2.5-flash') as never),
        tools: { note_read: { parameters: z.object({}) }, note_write: { parameters: z.object({}) } }, streamTextFn: streamText as never }),
    })
    expect(writes).toBe(1)
    const contents = requests[1].contents
    expect(contents).toHaveLength(3)
    expect(contents[1].parts.filter((p: any) => p.functionCall)).toHaveLength(2)
    expect(contents[2].parts.map((p: any) => p.functionResponse.name)).toEqual(['note_read', 'note_write'])
  })

  it('never combines results across user or assistant turns', () => {
    const result = (id: string) => ({ role: 'tool' as const, content: '{}', toolCallId: id, toolName: 'read' })
    const messages = [result('a'), result('b'), { role: 'user' as const, content: 'Next' }, result('c')]
    const converted = toVercelMessages(messages)
    expect(converted.map(message => message.role)).toEqual(['tool', 'user', 'tool'])
    expect(converted[0].content).toHaveLength(2)
    expect(messages).toHaveLength(4)
  })
})
