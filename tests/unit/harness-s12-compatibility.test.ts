import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseNote, serializeNote, taskContractHash, validateNote } from '@janus-agent/harness-core'
import { SUPPORTED_HARNESS_PROFILE } from '@janus-agent/harness-node'

// R1: note://972afef3-2fc7-49de-a3ee-7e041225d28c/81fc137e-9c56-4d3a-88e4-10f175852c97
const standard = resolve('../WorkFlowX/standards/harness-note/1')
const fixture = (name: string) => readFileSync(resolve(standard, 'fixtures', name), 'utf8')

describe('installed S1.2 consumer compatibility', () => {
  it('loads the exact released runtime and repository profile', () => {
    const manifest = readFileSync(resolve(standard, 'manifest.json'), 'utf8').replace(/\r\n/g, '\n')
    const actual = JSON.parse(readFileSync('.agents/harness.json', 'utf8')).profile
    expect(JSON.parse(manifest)).toMatchObject({ version: '1.0.0-s1.2', status: 'final' })
    expect(SUPPORTED_HARNESS_PROFILE).toEqual({ id: 'workflowx', version: '1.0.0-s1.2',
      digest: createHash('sha256').update(manifest).digest('hex') })
    expect(actual).toEqual(SUPPORTED_HARNESS_PROFILE)
  })
  it('accepts every positive fixture through the installed dependency', () => {
    for (const name of readdirSync(resolve(standard, 'fixtures')).filter(n => /^valid-.*\.md$/.test(n))) {
      expect(validateNote(parseNote(fixture(name))), name).toEqual([])
    }
    const note = parseNote(fixture('valid-initiative-interfaces.md'))
    expect(note.meta.interfaces).toHaveLength(3)
    expect(parseNote(serializeNote(note)).meta.interfaces).toEqual(note.meta.interfaces)
    expect(taskContractHash(parseNote(fixture('valid-task.md')))).toBe('73e315502bb2e0678461ba859f4d16d73c101bdd55d2c167ecbee36eae1b8ae6')
  })
  it.each(['invalid-bad-interface.md', 'invalid-interface-owner.md'])('rejects %s', name => {
    expect(validateNote(parseNote(fixture(name)))).toContainEqual(expect.objectContaining({ code: 'SCHEMA_INVALID' }))
  })
})
