import { describe, expect, it } from 'vitest'
import { isRawKnowledgeContent } from '../../../src/main/knowledge/knowledge-content'

const toolEnvelope = JSON.stringify({ i: 0, status: 'fulfilled', value: {
  chunk_id: 'fixture', wall_time_seconds: 0.5, exit_code: 0, original_token_count: 5477,
  output: '1:---\n2:schema: harness-note/1\n3:决定采用数据库事务。' + 'Details. '.repeat(40),
} })

describe('knowledge content boundary', () => {
  it.each([
    toolEnvelope, toolEnvelope.slice(0, 200),
    'Script completed\nWall time: 0.5 seconds\nOutput:\nwe decided to use sqlite',
    'Chunk ID: fixture\nWall time: 0.5 seconds\nOutput: never retry',
    '2255\t  @media (prefers-reduced-motion: reduce) {',
    '696\t/* A branch edge is revealed with its child node, never ahead of it. */',
    '2255:@media (prefers-reduced-motion: reduce) {',
    '1:---\n2:schema: harness-note/1\n3:决定采用数据库事务。',
  ])('recognizes complete and truncated raw execution evidence: %s', content => {
    expect(isRawKnowledgeContent(content)).toBe(true)
  })

  it.each([
    '{"packageManager":"pnpm","preferOffline":true}',
    '执行结果中 chunk_id 和 wall_time_seconds 仅用于诊断。',
    'CSS uses prefers-reduced-motion to respect accessibility preferences.',
    '1. 决定采用事务\n2. 失败时回滚',
    '1: Always validate inputs\n2: Never retry non-idempotent requests',
    '请求失败时 never retry 只适用于非幂等操作。',
  ])('preserves configuration and explanatory statements: %s', content => {
    expect(isRawKnowledgeContent(content)).toBe(false)
  })
})
