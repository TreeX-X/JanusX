import type { WikiPageRelation } from './knowledge'

export function wikiPageUri(workspaceId: string, slug: string): string {
  return `wiki://${encodeURIComponent(workspaceId)}/${encodeURIComponent(slug)}`
}
export function parseWikiPageUri(uri: string): { workspaceId: string; slug: string } | undefined {
  const match = /^wiki:\/\/([^/]+)\/([^/?#]+)$/.exec(uri)
  if (!match) return undefined
  try {
    const workspaceId = decodeURIComponent(match[1]!), slug = decodeURIComponent(match[2]!)
    if (!workspaceId || !slug || wikiPageUri(workspaceId, slug) !== uri) return undefined
    return { workspaceId, slug }
  } catch { return undefined }
}
export function wikiRelationKey(relation: WikiPageRelation): string {
  return JSON.stringify([relation.type, relation.target.workspaceId, relation.target.slug])
}
