import { fromMarkdown } from 'mdast-util-from-markdown'
import type { RootContent } from 'mdast'
import { z } from 'zod'
import type { WikiPage, WikiPageRelation, WikiRelationIssue } from '../../shared/knowledge'
import { parseWikiPageUri, wikiPageUri, wikiRelationKey } from '../../shared/wiki-relations'
import { wikiContentHash } from './wiki-history'

const targetSchema = z.object({ workspaceId: z.string().min(1), slug: z.string().min(1), title: z.string().min(1),
  version: z.number().int().positive(), contentHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
export const wikiRelationsSchema = z.array(z.object({ type: z.enum(['references', 'depends_on', 'conflicts_with']),
  target: targetSchema, reason: z.string().trim().min(1).max(1000), sourceFactIds: z.array(z.string().min(1)).max(100) }).strict()).max(32)

/** Parse only real Markdown links, including reference links; ignore code, HTML and images. */
export function wikiMarkdownTargets(markdown: string): Array<{ workspaceId: string; slug: string }> {
  const tree = fromMarkdown(markdown)
  const definitions = new Map<string, string>()
  function walk(nodes: RootContent[], visit: (node: RootContent) => void) {
    for (const node of nodes) { visit(node); if ('children' in node) walk(node.children as RootContent[], visit) }
  }
  walk(tree.children, node => { if (node.type === 'definition' && !definitions.has(node.identifier)) definitions.set(node.identifier, node.url) })
  const targets = new Map<string, { workspaceId: string; slug: string }>()
  walk(tree.children, node => {
    const url = node.type === 'link' ? node.url : node.type === 'linkReference' ? definitions.get(node.identifier) : undefined
    if (!url?.startsWith('wiki:')) return
    const target = parseWikiPageUri(url)
    if (!target) throw new Error('wiki-reference-invalid')
    targets.set(url, target)
  })
  return [...targets.values()]
}
export function wikiTarget(page: WikiPage): WikiPageRelation['target'] {
  return { workspaceId: page.workspaceId, slug: page.slug, title: page.title, version: page.version, contentHash: wikiContentHash(page) }
}
export function normalizeWikiRelations(input: unknown): WikiPageRelation[] {
  const unique = new Map<string, WikiPageRelation>()
  for (const item of wikiRelationsSchema.parse(input)) {
    const relation = { ...item, sourceFactIds: [...new Set(item.sourceFactIds)].sort() }
    const key = wikiRelationKey(relation), old = unique.get(key)
    if (old && JSON.stringify(old) !== JSON.stringify(relation)) throw new Error('wiki-relation-conflicting-duplicate')
    unique.set(key, relation)
  }
  return [...unique.values()].sort((a, b) => wikiRelationKey(a).localeCompare(wikiRelationKey(b)))
}
export function wikiRelationIssues(page: Pick<WikiPage, 'workspaceId' | 'slug' | 'relations'>, pages: WikiPage[]): WikiRelationIssue[] {
  const issues: WikiRelationIssue[] = []
  for (const relation of page.relations ?? []) {
    const matches = pages.filter(target => target.workspaceId === relation.target.workspaceId && target.slug === relation.target.slug)
    const target = matches[0]
    const status = relation.target.workspaceId !== page.workspaceId || relation.target.slug === page.slug ? 'invalid'
      : matches.length > 1 ? 'ambiguous' : !target || target.status !== 'published' ? 'missing'
      : target.freshness === 'stale' ? 'stale'
      : target.version !== relation.target.version || wikiContentHash(target) !== relation.target.contentHash ? 'changed' : undefined
    if (status) issues.push({ targetSlug: relation.target.slug, type: relation.type, status })
  }
  return issues
}
export function assertWikiRelations(page: Pick<WikiPage, 'workspaceId' | 'slug' | 'markdown' | 'sourceFactIds' | 'sourceFactRefs' | 'relations'>, pages: WikiPage[]): void {
  const relations = normalizeWikiRelations(page.relations ?? [])
  const issues = wikiRelationIssues({ ...page, relations }, pages)
  if (issues.length) throw new Error(`wiki-relation-target-${issues[0]!.status}: ${issues[0]!.targetSlug}`)
  const links = wikiMarkdownTargets(page.markdown)
  for (const target of links) {
    if (!relations.some(relation => relation.type === 'references' && relation.target.workspaceId === target.workspaceId && relation.target.slug === target.slug)) throw new Error('wiki-reference-unbound')
  }
  for (const relation of relations) {
    if (relation.sourceFactIds.some(id => !page.sourceFactIds.includes(id))) throw new Error('wiki-relation-source-invalid')
    if (relation.sourceFactIds.some(id => !page.sourceFactRefs?.some(ref => ref.id === id))) throw new Error('wiki-relation-source-unbound')
    if (relation.type !== 'references' && !relation.sourceFactIds.length) throw new Error('wiki-relation-evidence-required')
    if (relation.type === 'references' && !links.some(target => target.workspaceId === relation.target.workspaceId && target.slug === relation.target.slug)) throw new Error('wiki-reference-not-in-page')
  }
}
export function bindWikiReferences(markdown: string, workspaceId: string, slug: string, pages: WikiPage[]): WikiPageRelation[] {
  return wikiMarkdownTargets(markdown).map(identity => {
    const targets = pages.filter(page => page.workspaceId === identity.workspaceId && page.slug === identity.slug && page.status === 'published' && page.freshness !== 'stale')
    if (identity.workspaceId !== workspaceId || identity.slug === slug || targets.length !== 1) throw new Error('wiki-reference-target-unavailable')
    const page = targets[0]!
    return { type: 'references', target: wikiTarget(page), reason: wikiPageUri(workspaceId, page.slug), sourceFactIds: [] }
  })
}
