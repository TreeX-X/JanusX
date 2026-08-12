#!/usr/bin/env node
/**
 * CI check: ensures locale catalogs stay in sync.
 * - Every key in zh-CN must exist in en (and vice versa).
 * - No empty string values (missing translations).
 * - Exit non-zero on violations.
 */
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const LOCALES_DIR = join(__dirname, '..', 'src', 'renderer', 'src', 'i18n', 'locales')
const LANGS = ['zh-CN', 'en']

function flattenKeys(obj, prefix = '') {
  const keys = new Set()
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const k of flattenKeys(value, path)) keys.add(k)
    } else {
      keys.add(path)
    }
  }
  return keys
}

async function loadNamespaces(lang) {
  const dir = join(LOCALES_DIR, lang)
  const files = await readdir(dir)
  const map = new Map()
  for (const file of files) {
    if (!file.endsWith('.json')) continue
    const ns = file.slice(0, -5)
    const raw = await readFile(join(dir, file), 'utf8')
    const parsed = JSON.parse(raw)
    map.set(ns, { parsed, keys: flattenKeys(parsed) })
  }
  return map
}

async function main() {
  const bundles = new Map()
  for (const lang of LANGS) {
    bundles.set(lang, await loadNamespaces(lang))
  }

  const [zh, en] = [bundles.get('zh-CN'), bundles.get('en')]
  const errors = []

  const namespaces = new Set([...zh.keys(), ...en.keys()])
  for (const ns of namespaces) {
    const zhNs = zh.get(ns)
    const enNs = en.get(ns)
    if (!zhNs) {
      errors.push(`namespace "${ns}" missing in zh-CN`)
      continue
    }
    if (!enNs) {
      errors.push(`namespace "${ns}" missing in en`)
      continue
    }

    for (const key of zhNs.keys) {
      if (!enNs.keys.has(key)) {
        errors.push(`ns="${ns}" key="${key}" missing in en`)
      }
    }
    for (const key of enNs.keys) {
      if (!zhNs.keys.has(key)) {
        errors.push(`ns="${ns}" key="${key}" missing in zh-CN`)
      }
    }

    for (const [key, value] of Object.entries(zhNs.parsed)) {
      if (typeof value === 'string' && value.trim() === '') {
        errors.push(`ns="${ns}" key="${key}" empty value in zh-CN`)
      }
    }
    for (const [key, value] of Object.entries(enNs.parsed)) {
      if (typeof value === 'string' && value.trim() === '') {
        errors.push(`ns="${ns}" key="${key}" empty value in en`)
      }
    }
  }

  if (errors.length > 0) {
    console.error(`[i18n:check] ${errors.length} violation(s):`)
    for (const e of errors) console.error(`  - ${e}`)
    process.exit(1)
  }

  console.log(`[i18n:check] OK — ${[...namespaces].length} namespaces, both languages in sync.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})