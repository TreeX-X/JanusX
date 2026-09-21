import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  parseChecks,
  parseIssues,
  parsePrComments,
  parsePrList,
  resetAuthCache,
  selectFailedRuns,
  truncateLog,
} from '../../src/main/hosted/github'

afterEach(() => {
  resetAuthCache()
})

describe('parsePrList', () => {
  const payload = [
    {
      number: 12,
      title: 'Auth retry',
      isDraft: false,
      state: 'OPEN',
      baseRefName: 'main',
      headRefName: 'feature/auth-retry',
      url: 'https://github.com/o/r/pull/12',
      statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }],
    },
    {
      number: 13,
      title: 'Draft work',
      isDraft: true,
      state: 'OPEN',
      baseRefName: 'main',
      headRefName: 'feature/draft',
      url: 'https://github.com/o/r/pull/13',
      statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'FAILURE' }],
    },
    {
      number: 14,
      title: 'Other branch',
      isDraft: false,
      state: 'OPEN',
      baseRefName: 'main',
      headRefName: 'feature/other',
      url: 'https://github.com/o/r/pull/14',
      statusCheckRollup: [],
    },
  ]

  it('keeps only the requested branch with states and check rollups', () => {
    const reviews = parsePrList(payload, 'feature/auth-retry')
    expect(reviews).toHaveLength(1)
    expect(reviews[0]).toMatchObject({ number: 12, state: 'open', checksState: 'passing' })
    const draft = parsePrList(payload, 'feature/draft')
    expect(draft).toMatchObject([{ state: 'draft', checksState: 'failing' }])
  })

  it('maps merged and closed states and rejects non-arrays', () => {
    const reviews = parsePrList(
      [
        { number: 1, state: 'MERGED', headRefName: 'b' },
        { number: 2, state: 'CLOSED', headRefName: 'b' },
      ],
      'b',
    )
    expect(reviews.map((r) => r.state)).toEqual(['merged', 'closed'])
    expect(parsePrList(null, 'b')).toEqual([])
    expect(parsePrList('nope', 'b')).toEqual([])
  })
})

describe('parseChecks', () => {
  it('normalizes gh check states', () => {
    const checks = parseChecks([
      { name: 'build', state: 'SUCCESS', link: 'https://x/1' },
      { name: 'test', state: 'FAILURE' },
      { name: 'lint', state: 'PENDING' },
      { name: 'docs', state: 'SKIPPED' },
      { name: 'weird', state: 'CANCELLED' },
    ])
    expect(checks).toEqual([
      { name: 'build', state: 'pass', url: 'https://x/1' },
      { name: 'test', state: 'fail' },
      { name: 'lint', state: 'pending' },
      { name: 'docs', state: 'skipped' },
      { name: 'weird', state: 'pending' },
    ])
  })

  it('rejects non-arrays', () => {
    expect(parseChecks(undefined)).toEqual([])
  })
})

describe('selectFailedRuns', () => {
  it('keeps failed runs up to the limit', () => {
    const runs = selectFailedRuns(
      [
        { databaseId: 1, name: 'ci', conclusion: 'failure' },
        { databaseId: 2, name: 'ok', conclusion: 'success' },
        { databaseId: 3, name: 'ci-2', conclusion: 'failure' },
        { databaseId: 4, name: 'ci-3', conclusion: 'failure' },
        { databaseId: 5, name: 'ci-4', conclusion: 'failure' },
      ],
      2,
    )
    expect(runs).toEqual([
      { id: 1, name: 'ci' },
      { id: 3, name: 'ci-2' },
    ])
  })
})

describe('truncateLog', () => {
  it('passes small logs through and caps large ones', () => {
    expect(truncateLog('short')).toEqual({ log: 'short', truncated: false })
    const big = `${'x'.repeat(9000)}\nTAIL`
    const result = truncateLog(big)
    expect(result.truncated).toBe(true)
    expect(result.log.endsWith('TAIL')).toBe(true)
    expect(Buffer.byteLength(result.log)).toBeLessThanOrEqual(6 * 1024 + 64)
  })
})

describe('parseIssues', () => {
  it('keeps numbered issues with labels', () => {
    expect(
      parseIssues([
        { number: 3, title: 'Bug', state: 'OPEN', url: 'https://x/3', labels: [{ name: 'bug' }, {}] },
        { number: 4, title: 'Old', state: 'CLOSED', url: 'https://x/4' },
        { title: 'no-number' },
      ]),
    ).toEqual([
      { number: 3, title: 'Bug', state: 'open', url: 'https://x/3', labels: ['bug'] },
      { number: 4, title: 'Old', state: 'closed', url: 'https://x/4', labels: [] },
    ])
    expect(parseIssues(null)).toEqual([])
  })
})

describe('parsePrComments', () => {
  it('flattens top-level and inline review comments', () => {
    const comments = parsePrComments({
      comments: [{ author: { login: 'a' }, body: 'looks good', createdAt: 't1' }],
      reviews: [
        {
          author: { login: 'b' },
          body: 'needs work',
          submittedAt: 't2',
          comments: [{ author: { login: 'b' }, body: 'here', createdAt: 't3', path: 'a.ts', line: 10 }],
        },
        { author: { login: 'c' }, body: '  ', submittedAt: 't4' },
      ],
    })
    expect(comments).toEqual([
      { id: 'gh-1', author: 'a', body: 'looks good', createdAt: 't1' },
      { id: 'gh-2', author: 'b', body: 'needs work', createdAt: 't2' },
      { id: 'gh-3', author: 'b', body: 'here', path: 'a.ts', line: 10, createdAt: 't3' },
    ])
  })

  it('rejects non-objects', () => {
    expect(parsePrComments(null)).toEqual([])
  })
})
