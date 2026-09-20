import { describe, expect, it } from 'vitest'
import { parseFilesList, validateFilePatterns } from '../../scripts/check-package-boundary.mjs'

const inclusions = ['**/*', 'package.json']

const treeExclusions = [
  '  - !.agents{,/**/*}',
  '  - !.cache{,/**/*}',
  '  - !.claude{,/**/*}',
  '  - !.codex{,/**/*}',
  '  - !.github{,/**/*}',
  '  - !.janusX{,/**/*}',
  '  - !artifacts{,/**/*}',
  '  - !design{,/**/*}',
  '  - !docs{,/**/*}',
  '  - !packages{,/**/*}',
  '  - !release{,/**/*}',
  '  - !src{,/**/*}',
  '  - !test-results{,/**/*}',
  '  - !tests{,/**/*}',
  '  - !wiki{,/**/*}',
]

function filesYaml(lines: string[]): string {
  return ['files:', ...lines, 'asarUnpack:', '  - node_modules/node-pty/**/*'].join('\n')
}

describe('package boundary parser', () => {
  it('accepts blanks and comments without truncating the files sequence', () => {
    const yaml = filesYaml(['  - **/*', '', '  # runtime renderer assets', '  - package.json', ...treeExclusions])

    expect(() => validateFilePatterns(parseFilesList(yaml))).not.toThrow()
  })

  it('accepts quoted and negated glob patterns', () => {
    const yaml = filesYaml([
      '  - "**/*"',
      '  - "!node_modules/.bin{,/**/*}"',
      '  - "!node_modules/.vite{,/**/*}"',
      '  - package.json',
      ...treeExclusions,
    ])

    expect(() => validateFilePatterns(parseFilesList(yaml))).not.toThrow()
  })

  it('accepts an extension-wide exclusion for a debug artifact class', () => {
    const yaml = filesYaml([
      '  - **/*',
      '  - "!node_modules/electron{,/**/*}"',
      '  - "!**/*.map"',
      '  - package.json',
      ...treeExclusions,
    ])

    expect(() => validateFilePatterns(parseFilesList(yaml))).not.toThrow()
  })

  it('rejects an extension-wide exclusion that is not a plain file suffix', () => {
    const yaml = filesYaml(['  - **/*', '  - "!**/*.{map,cjs}"', '  - package.json', ...treeExclusions])

    expect(() => validateFilePatterns(parseFilesList(yaml))).toThrow(/unknown paths/)
  })

  it('rejects dropping the verbatim tree inclusion', () => {
    const yaml = filesYaml(['  - package.json', ...treeExclusions])

    expect(() => validateFilePatterns(parseFilesList(yaml))).toThrow(/\*\*\/\*/)
  })

  it('rejects including a repository source directly', () => {
    const yaml = filesYaml(['  - **/*', '  - src', '  - package.json', ...treeExclusions])

    expect(() => validateFilePatterns(parseFilesList(yaml))).toThrow(/must not include/)
  })

  it('rejects a missing repository exclusion', () => {
    const yaml = filesYaml(['  - **/*', '  - package.json', ...treeExclusions.filter((p) => !p.includes('src'))])

    expect(() => validateFilePatterns(parseFilesList(yaml))).toThrow(/must exclude.*src/)
  })
  it('rejects duplicate entries', () => {
    const yaml = filesYaml(['  - **/*', '  - **/*', '  - package.json', ...treeExclusions])

    expect(() => validateFilePatterns(parseFilesList(yaml))).toThrow(/duplicate entries/)
  })

  it('rejects duplicate top-level files keys', () => {
    const yaml = `${filesYaml(['  - **/*', '  - package.json', ...treeExclusions])}\nfiles:\n  - out`

    expect(() => parseFilesList(yaml)).toThrow(/Duplicate top-level files key/)
  })

  it('rejects unsupported sequence content instead of truncating', () => {
    const yaml = filesYaml(['  - path: out/main/**'])

    expect(() => parseFilesList(yaml)).toThrow(/Unsupported files sequence content/)
  })
})
