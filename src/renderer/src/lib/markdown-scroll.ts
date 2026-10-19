import type { Root, Element } from 'hast'

/** Keep source positions on top-level blocks without changing shared renderers. */
export function rehypeMarkdownSourceBlocks() {
  return (tree: Root) => {
    tree.children = tree.children.map(node => {
      if (node.type !== 'element' || !node.position) return node
      return {
        type: 'element', tagName: 'div',
        properties: { 'data-source-line': node.position.start.line, style: 'display:flow-root' },
        children: [node],
      } satisfies Element
    })
  }
}

export interface ScrollAnchor { source: number; target: number }

export function mapMarkdownScroll(scrollTop: number, sourceMax: number, targetMax: number, blocks: ScrollAnchor[]): number {
  if (sourceMax <= 0 || targetMax <= 0 || scrollTop <= 0) return 0
  if (scrollTop >= sourceMax - 1) return targetMax
  const anchors = [
    { source: 0, target: 0 },
    ...blocks.filter(block => block.source > 0 && block.source < sourceMax),
    { source: sourceMax, target: targetMax },
  ]
  for (let i = 1; i < anchors.length; i++) {
    const next = anchors[i]
    const previous = anchors[i - 1]
    if (scrollTop > next.source) continue
    const progress = (scrollTop - previous.source) / (next.source - previous.source)
    return Math.max(0, Math.min(targetMax, previous.target + progress * (next.target - previous.target)))
  }
  return targetMax
}
