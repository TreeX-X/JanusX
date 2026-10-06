import { createHash } from 'node:crypto'
import type { MemoryFact, WikiPage } from '../../shared/knowledge'

function category(fact: MemoryFact): [string, string] {
  if (fact.factKey) return ['configuration', '项目配置']
  if (fact.kind === 'decision') return ['decisions', '技术决策']
  if (fact.kind === 'procedure') return ['workflows', '操作流程']
  return ['project-knowledge', '项目知识']
}
function topic(fact: MemoryFact) {
  const [kind, label] = category(fact)
  const concept = fact.concepts.map(text => text.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()).filter(Boolean).sort()[0]
  const key = JSON.stringify([kind, concept ?? ''])
  return { key, slug: concept ? `${kind}/${createHash('sha256').update(key).digest('hex').slice(0, 24)}` : kind, title: concept ? `${concept} · ${label}` : label }
}
// Note: existing pages keep identity; new topics use explicit concepts — see .agents/notes/2026-10-06-knowledge-review-status-audit-plan--76ef32d1.md
export function groupWikiTopics(facts: MemoryFact[], pages: WikiPage[]) {
  const groups = new Map<string, { workspaceId: string; slug: string; title: string; topicKey: string; facts: MemoryFact[]; page?: WikiPage }>()
  for (const fact of [...facts].sort((a, b) => a.id.localeCompare(b.id))) {
    const workspaceId = fact.provenance.workspaceId, selected = topic(fact)
    const scoped = pages.filter(page => page.workspaceId === workspaceId).sort((a, b) => a.slug.localeCompare(b.slug))
    // Previously published sources (including superseded facts) retain their page; manual pages remain protected.
    const page = scoped.find(page => page.sourceFactIds.includes(fact.id) || !!fact.supersedes && page.sourceFactIds.includes(fact.supersedes))
      ?? scoped.find(page => page.topicKey === selected.key || page.slug === selected.slug)
      ?? scoped.find(page => facts.some(source => source.provenance.workspaceId === workspaceId && page.sourceFactIds.includes(source.id) && topic(source).key === selected.key))
    const slug = page?.slug ?? selected.slug, key = JSON.stringify([workspaceId, slug])
    const group = groups.get(key) ?? { workspaceId, slug, title: page?.title ?? selected.title, topicKey: page?.topicKey ?? (page ? `legacy:${page.slug}` : selected.key), page, facts: [] }
    group.facts.push(fact); groups.set(key, group)
  }
  return [...groups.values()]
}
