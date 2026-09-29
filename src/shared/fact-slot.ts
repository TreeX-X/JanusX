import type { MemoryFact } from './knowledge'

/** Only explicit single-line labels are structured; prose and fuzzy similarity confer no slot identity. */
export function factSlot(content: string): { factKey: 'release.command' | 'response.language'; cardinality: 'single'; polarity: 'positive' | 'negative'; value: string } | undefined {
  const match = /^(发布命令|release command|默认输出语言|default output language)\s*(!=|[:：=])\s*([^\r\n]+)$/i.exec(content.trim())
  if (!match) return undefined
  const factKey = /发布|release/i.test(match[1]) ? 'release.command' : 'response.language'
  let value = match[3].trim().replace(/^`([^`]+)`$/, '$1')
  if (factKey === 'response.language') {
    const languages: Record<string, string> = { '中文': 'zh', '简体中文': 'zh', chinese: 'zh', 'zh-cn': 'zh', zh: 'zh', '英文': 'en', '英语': 'en', english: 'en', en: 'en' }
    value = languages[value.toLowerCase()] ?? ''
  } else if (!/^[\w./\\-]+(?:[ \t]+[^\r\n]+)?$/.test(value)) return undefined
  return value ? { factKey, cardinality: 'single', polarity: match[2] === '!=' ? 'negative' : 'positive', value } : undefined
}

export function factSlotFields(content: string): Pick<MemoryFact, 'factKey' | 'cardinality' | 'polarity'> {
  const slot = factSlot(content)
  return slot ? { factKey: slot.factKey, cardinality: slot.cardinality, polarity: slot.polarity } : {}
}

export function slotsConflict(left: string, right: string): boolean {
  const a = factSlot(left), b = factSlot(right)
  if (!a || !b || a.factKey !== b.factKey) return false
  return a.polarity === b.polarity ? a.polarity === 'positive' && a.value !== b.value : a.value === b.value
}

/** Structured assertions cannot disappear into a similar but different value or polarity. */
export function canMergeFactText(left: string, right: string): boolean {
  const a = factSlot(left), b = factSlot(right)
  return !a && !b || !!a && !!b && a.factKey === b.factKey && a.polarity === b.polarity && a.value === b.value
}
