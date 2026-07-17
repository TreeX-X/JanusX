import { describe, expect, it } from 'vitest'
import { parseFilesList, validateFilePatterns } from '../../scripts/check-package-boundary.mjs'

const requiredPatterns = [
  'out/main/**',
  'out/preload/**',
  'out/renderer/**',
  'package.json',
]

function filesYaml(lines: string[]): string {
  return ['files:', ...lines, 'asarUnpack:', '  - node_modules/node-pty/**/*'].join('\n')
}

describe('package boundary parser', () => {
  it('accepts blanks and comments without truncating the files sequence', () => {
    const yaml = filesYaml([
      '  - out/main/**',
      '',
      '  # runtime renderer assets',
      '  - out/preload/**',
      '  - out/renderer/**',
      '  - package.json',
    ])

    expect(() => validateFilePatterns(parseFilesList(yaml))).not.toThrow()
  })

  it.each(['out', 'out/*.png'])(`rejects broad inclusion %s`, (pattern) => {
    expect(() => validateFilePatterns([...requiredPatterns, pattern])).toThrow(/unexpected/)
  })

  it('rejects a broad pattern after an intervening comment', () => {
    const yaml = filesYaml([
      ...requiredPatterns.map((pattern) => `  - ${pattern}`),
      '  # this must not terminate parsing',
      '  - out',
    ])

    expect(() => validateFilePatterns(parseFilesList(yaml))).toThrow(/unexpected: out/)
  })

  it('rejects a missing required entry', () => {
    expect(() => validateFilePatterns(requiredPatterns.slice(1))).toThrow(/Missing: out\/main\/\*\*/)
  })

  it('rejects duplicate top-level files keys', () => {
    const yaml = `${filesYaml(requiredPatterns.map((pattern) => `  - ${pattern}`))}\nfiles:\n  - out`

    expect(() => parseFilesList(yaml)).toThrow(/Duplicate top-level files key/)
  })

  it('rejects unsupported sequence content instead of truncating', () => {
    const yaml = filesYaml(['  - path: out/main/**'])

    expect(() => parseFilesList(yaml)).toThrow(/Unsupported files sequence content/)
  })
})
