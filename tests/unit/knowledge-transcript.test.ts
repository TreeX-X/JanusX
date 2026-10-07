import { beforeEach, afterEach, expect, it } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readKnowledgeTurn } from '../../src/main/sessions/knowledge-transcript'
import { taskNotification } from './knowledge/memory-observation.fixture'
let root: string, path: string
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'knowledge-transcript-')); path = join(root, 'session.jsonl') })
afterEach(async () => { await rm(root, { recursive: true, force: true }) })
const claude = (role: string, content: unknown, uuid: string) => ({ type: role, uuid, message: { role, content } })
async function rows(items: unknown[]) { await writeFile(path, items.map(JSON.stringify).join('\n') + '\n') }
it('binds a delayed reread to the original completion when a later prompt repeats', async () => {
  await rows([
    { ...claude('user', 'Fix cache', 'u1'), timestamp: '2026-10-06T00:00:00Z' },
    { ...claude('assistant', 'First answer', 'a1'), timestamp: '2026-10-06T00:00:11Z' },
    { ...claude('user', 'Fix cache', 'u2'), timestamp: '2026-10-06T00:01:00Z' },
    { ...claude('assistant', 'Unrelated later answer', 'a2'), timestamp: '2026-10-06T00:01:10Z' },
  ])
  const result = await readKnowledgeTurn(path, 'claude', 'session', 'Fix cache', '2026-10-06T00:00:10Z')
  expect(result.messages.map(message => message.content)).toEqual(['Fix cache', 'First answer'])
})
it('does not guess between repeated prompts without timestamps during delayed capture', async () => {
  await rows([claude('user', 'Fix cache', 'u1'), claude('assistant', 'First answer', 'a1'),
    claude('user', 'Fix cache', 'u2'), claude('assistant', 'Later answer', 'a2')])
  const result = await readKnowledgeTurn(path, 'claude', 'session', 'Fix cache', '2026-10-06T00:00:10Z')
  expect(result).toEqual({ messages: [], reason: 'transcript-turn-boundary-ambiguous' })
})
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
it('keeps the real turn boundary and later answer across runtime and trusted meta messages', async () => {
  await rows([claude('user', 'Fix the cache', 'u1'),
    claude('user', taskNotification(), 'notification'),
    { ...claude('user', 'Runtime context reminder', 'meta'), isMeta: true },
    claude('assistant', 'Cache fixed', 'a1')])
  for (const prompt of [undefined, 'Fix the cache']) {
    const result = await readKnowledgeTurn(path, 'claude', 's', prompt)
    expect(result.reason).toBeUndefined()
    expect(result.messages.map(message => message.content)).toEqual(['Fix the cache', 'Cache fixed'])
  }
})
it('preserves notification quotations as real user requests', async () => {
  const prompt = `解释这条通知\n${taskNotification()}`
  await rows([claude('user', prompt, 'u1'), claude('assistant', '这是后台任务完成通知', 'a1')])
  expect((await readKnowledgeTurn(path, 'claude', 's', prompt)).messages[0].content).toBe(prompt)
})
it.each(['codex', 'pi', 'janus'])('filters known notifications without changing %s turn boundaries', async engine => {
  const messages = [{ role: 'user', content: 'Fix' }, { role: 'user', content: taskNotification() }, { role: 'assistant', content: 'Fixed' }]
  if (engine === 'janus') await writeFile(path, JSON.stringify({ messages }))
  else if (engine === 'codex') await rows(messages.map(message => ({ type: 'response_item', payload: { type: 'message', ...message } })))
  else await rows(messages.map((message, id) => ({ type: 'message', id: String(id), message })))
  expect((await readKnowledgeTurn(path, engine, 's')).messages.map(message => message.content)).toEqual(['Fix', 'Fixed'])
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
it('recovers only the matching OpenCode workspace and turn before the recorded completion', async () => {
  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(path)
  try {
    db.exec('CREATE TABLE session (id TEXT, directory TEXT); CREATE TABLE message (id TEXT, session_id TEXT, time_created INTEGER, data TEXT); CREATE TABLE part (id TEXT, message_id TEXT, time_created INTEGER, data TEXT)')
    db.prepare('INSERT INTO session VALUES (?, ?)').run('s', '/project')
    for (const [id, time, role, text] of [['u', 100, 'user', 'First'], ['a', 200, 'assistant', 'First answer'], ['u2', 400, 'user', 'Later'], ['a2', 500, 'assistant', 'Later answer']] as const) {
      db.prepare('INSERT INTO message VALUES (?, ?, ?, ?)').run(id, 's', time, JSON.stringify({ role }))
      db.prepare('INSERT INTO part VALUES (?, ?, ?, ?)').run(id, id, time, JSON.stringify({ type: 'text', text }))
    }
  } finally { db.close() }
  const ended = new Date(300).toISOString()
  expect((await readKnowledgeTurn(path, 'opencode', 's', undefined, ended, '/wrong')).reason).toBe('transcript-workspace-mismatch')
  const result = await readKnowledgeTurn(path, 'opencode', 's', undefined, ended, '/project')
  expect(result.messages.map(item => item.content)).toEqual(['First', 'First answer'])
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
