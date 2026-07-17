import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const REQUIRED_PATTERNS = [
  'out/main/**',
  'out/preload/**',
  'out/renderer/**',
  'package.json',
]

const REQUIRED_OUTPUTS = [
  'out/main/index.js',
  'out/main/knowledge-mcp.js',
  'out/main/office-mcp.js',
  'out/main/office-launcher.js',
  'out/preload/index.mjs',
  'out/renderer/index.html',
]

export function parseFilesList(yaml) {
  const lines = yaml.split(/\r?\n/)
  let foundFiles = false
  let inFiles = false
  const values = []

  for (const [index, line] of lines.entries()) {
    if (line.includes('\t')) throw new Error(`Tabs are unsupported in electron-builder.yml at line ${index + 1}`)

    const topLevelFiles = line.match(/^files\s*:(.*)$/)
    if (topLevelFiles) {
      if (foundFiles) throw new Error('Duplicate top-level files key')
      if (topLevelFiles[1].trim() && !topLevelFiles[1].trim().startsWith('#')) {
        throw new Error('The top-level files value must be a block sequence')
      }
      foundFiles = true
      inFiles = true
      continue
    }

    if (!inFiles) continue
    if (!line.trim() || /^\s*#/.test(line)) continue
    if (!/^\s/.test(line)) {
      if (!/^[A-Za-z0-9_-]+\s*:/.test(line)) {
        throw new Error(`Unsupported content after files sequence at line ${index + 1}`)
      }
      inFiles = false
      continue
    }

    const item = line.match(/^  -\s+([A-Za-z0-9_./*+-]+)\s*$/)
    if (!item) throw new Error(`Unsupported files sequence content at line ${index + 1}`)
    values.push(item[1])
  }

  if (!foundFiles) throw new Error('Missing top-level files list')
  return values
}

export function validateFilePatterns(patterns) {
  if (new Set(patterns).size !== patterns.length) {
    throw new Error('Package files allowlist contains duplicate entries')
  }
  const missing = REQUIRED_PATTERNS.filter((pattern) => !patterns.includes(pattern))
  const unexpected = patterns.filter((pattern) => !REQUIRED_PATTERNS.includes(pattern))
  if (missing.length || unexpected.length) {
    throw new Error(
      `Package files must be the explicit runtime allowlist. Missing: ${missing.join(', ') || 'none'}; unexpected: ${unexpected.join(', ') || 'none'}`,
    )
  }
}

export function checkPackageBoundary(root = process.cwd()) {
  const config = readFileSync(`${root}/electron-builder.yml`, 'utf8')
  validateFilePatterns(parseFilesList(config))

  const missingOutputs = REQUIRED_OUTPUTS.filter((path) => !existsSync(`${root}/${path}`))
  if (missingOutputs.length) {
    throw new Error(`Run the production build first; missing package outputs: ${missingOutputs.join(', ')}`)
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    checkPackageBoundary()
    console.log('Package boundary verified: explicit runtime allowlist and required outputs are present.')
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
