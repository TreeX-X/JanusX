import { describe, expect, it } from 'vitest'
import { mapMarkdownScroll, rehypeMarkdownSourceBlocks } from '../../src/renderer/src/lib/markdown-scroll'
import type { Root } from 'hast'

describe('Markdown source scroll mapping', () => {
  it('aligns source blocks despite images making preview heights very different', () => {
    const anchors = [{ source: 100, target: 600 }, { source: 300, target: 700 }]
    expect(mapMarkdownScroll(100, 1000, 2000, anchors)).toBe(600)
    expect(mapMarkdownScroll(200, 1000, 2000, anchors)).toBe(650)
    expect(mapMarkdownScroll(1000, 1000, 2000, anchors)).toBe(2000)
    expect(mapMarkdownScroll(0, 1000, 2000, anchors)).toBe(0)
    expect(mapMarkdownScroll(100, 0, 2000, anchors)).toBe(0)
  })

  it('records top-level source positions without touching nested renderer nodes', () => {
    const tree: Root = { type: 'root', children: [{ type: 'element', tagName: 'h1', properties: {}, children: [], position: { start: { line: 5, column: 1, offset: 8 }, end: { line: 5, column: 9, offset: 16 } } }] }
    rehypeMarkdownSourceBlocks()(tree)
    expect(tree.children[0]).toMatchObject({ tagName: 'div', properties: { 'data-source-line': 5 }, children: [{ tagName: 'h1' }] })
  })
})
