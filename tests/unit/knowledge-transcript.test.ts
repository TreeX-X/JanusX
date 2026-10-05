import { beforeEach, afterEach, expect, it } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readKnowledgeTurn } from '../../src/main/sessions/knowledge-transcript'
let root: string, path: string
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'knowledge-transcript-')); path = join(root, 'session.jsonl') })
afterEach(async () => { await rm(root, { recursive: true, force: true }) })
const claude = (role: string, content: unknown, uuid: string) => ({ type: role, uuid, message: { role, content } })
async function rows(items: unknown[]) { await writeFile(path, items.map(JSON.stringify).join('\n') + '\n') }
it('captures full user, assistant and tool evidence for the matching turn, excluding later requests', async () => {
  const answer = 'result '.repeat(900)
  await rows([claude('user', 'Implement B', 'u1'), claude('assistant', [{ type: 'text', text: answer }], 'a1'),
    claude('user', [{ type: 'tool_result', content: 'test passed', tool_use_id: 't1' }], 'tool'),
    claude('user', 'Next task', 'u2'), claude('assistant', 'next answer', 'a2')])
  const first = await readKnowledgeTurn(path, 'claude', 'session', 'Implement B')
  expect(first.reason).toBeUndefined(); expect(first.messages.map(message => message.speaker)).toEqual(['user', 'assistant', 'tool'])
  expect(first.messages[1].content).toBe(answer.trim())
  expect((await readKnowledgeTurn(path, 'claude', 'session', 'Implement B')).messages).toEqual(first.messages)
})
it('uses Codex source messages once and preserves tool results', async () => {
  await rows([{ type: 'event_msg', payload: { type: 'user_message', message: 'Fix' } },
    { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Fix' }] } },
    { type: 'response_item', payload: { type: 'function_call_output', call_id: 'call-1', output: '1 test passed' } },
    { type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Fixed' }] } },
    { type: 'event_msg', payload: { type: 'agent_message', message: 'Fixed' } }])
  const result = await readKnowledgeTurn(path, 'codex', 'session', 'Fix')
  expect(result.messages.map(message => message.content)).toEqual(['Fix', '1 test passed', 'Fixed'])
})
it.each(['pi', 'janus'])('preserves %s user, assistant and tool roles', async engine => {
  const messages = [{ role: 'user', content: 'Fix' }, { role: 'assistant', content: [{ type: 'text', text: 'Fixed' }] }, { role: 'toolResult', content: [{ type: 'text', text: 'passed' }] }]
  if (engine === 'janus') await writeFile(path, JSON.stringify({ messages }))
  else await rows(messages.map((message, id) => ({ type: 'message', id: String(id), message })))
  const result = await readKnowledgeTurn(path, engine, 'session', 'Fix')
  expect(result.reason).toBeUndefined()
  expect(result.messages.map(message => [message.speaker, message.content])).toEqual([['user', 'Fix'], ['assistant', 'Fixed'], ['tool', 'passed']])
})
it('reads OpenCode multipart user messages as one boundary and preserves tool outputs', async () => {
  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(path)
  try {
    db.exec('CREATE TABLE message (id TEXT, session_id TEXT, time_created INTEGER, data TEXT); CREATE TABLE part (id TEXT, message_id TEXT, time_created INTEGER, data TEXT)')
    const message = db.prepare('INSERT INTO message VALUES (?, ?, ?, ?)')
    message.run('u', 's', 1, JSON.stringify({ role: 'user' })); message.run('a', 's', 2, JSON.stringify({ role: 'assistant' }))
    const part = db.prepare('INSERT INTO part VALUES (?, ?, ?, ?)')
    part.run('u1', 'u', 1, JSON.stringify({ type: 'text', text: 'Fix' })); part.run('u2', 'u', 2, JSON.stringify({ type: 'text', text: 'the cache' }))
    part.run('a1', 'a', 3, JSON.stringify({ type: 'text', text: 'Fixed' })); part.run('t1', 'a', 4, JSON.stringify({ type: 'tool', state: { output: 'passed' } }))
  } finally { db.close() }
  const result = await readKnowledgeTurn(path, 'opencode', 's', 'Fix the cache')
  expect(result.reason).toBeUndefined()
  expect(result.messages.map(message => message.speaker)).toEqual(['user', 'assistant', 'tool'])
  expect(result.messages[0].content).toBe('Fix\nthe cache')
})
it('reports incomplete and unmatched sources rather than returning a misleading partial task', async () => {
  await rows([claude('user', 'Fix', 'u1')]); expect((await readKnowledgeTurn(path, 'claude')).reason).toBe('transcript-answer-not-ready')
  await rows([claude('user', 'Fix', 'u1'), claude('assistant', 'done', 'a1')])
  expect((await readKnowledgeTurn(path, 'claude', 's', 'Different')).reason).toBe('transcript-turn-boundary-missing')
  await writeFile(path, '{incomplete'); expect((await readKnowledgeTurn(path, 'claude')).reason).toBe('transcript-incomplete-or-invalid')
})
it('reads a complete turn from a large transcript tail without truncating the response', async () => {
  const prefix = Array.from({ length: 2500 }, (_, index) => JSON.stringify(claude('assistant', 'x'.repeat(1000), `old-${index}`))).join('\n')
  await writeFile(path, prefix + '\n' + [claude('user', 'New task', 'new'), claude('assistant', 'y'.repeat(10000), 'answer')].map(JSON.stringify).join('\n') + '\n')
  expect((await readKnowledgeTurn(path, 'claude', 's', 'New task')).messages[1].content).toHaveLength(10000)
})
