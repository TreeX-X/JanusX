import { createHash } from 'node:crypto'
import type { MemoryFact, WikiPage } from '../../shared/knowledge'
import { factScope } from './memory-evidence'

export function wikiFactHash(fact: MemoryFact): string {
  return createHash('sha256').update(JSON.stringify([fact.id, fact.provenance.workspaceId, factScope(fact), fact.version,
    fact.content, fact.kind, fact.ttl, fact.supersedes, fact.files, fact.concepts])).digest('hex')
}

export function wikiFreshness(page: WikiPage, facts: MemoryFact[], now = Date.now()): NonNullable<WikiPage['freshness']> {
  const sameDomain = facts.filter(fact => fact.provenance.workspaceId === page.workspaceId && factScope(fact) !== 'user'
    && fact.status === 'active' && (!fact.ttl || Date.parse(fact.ttl) > now))
  if (page.sourceFactIds.some(id => sameDomain.filter(fact => fact.id === id).length !== 1)) return 'stale'
  if (page.sourceFactRefs?.some(ref => { const fact = sameDomain.find(item => item.id === ref.id); return !fact || wikiFactHash(fact) !== ref.contentHash })) return 'stale'
  return page.sourceFactRefs?.length ? 'current' : 'unknown'
}
