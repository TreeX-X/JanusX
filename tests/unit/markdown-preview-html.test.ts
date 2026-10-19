import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import { describe, expect, it } from 'vitest'
import { fileMarkdownPlugins, previewUrlTransform, isPreviewImageUrl } from '../../src/renderer/src/lib/markdown-preview'

function render(content: string) {
  return renderToStaticMarkup(createElement(ReactMarkdown, { rehypePlugins: fileMarkdownPlugins, urlTransform: previewUrlTransform, children: content }))
}

describe('file Markdown HTML preview', () => {
  it('renders picture, source media, image dimensions and details instead of raw tags', () => {
    const html = render('## Star 历史\n\n<a href="https://www.star-history.com/#TreeX-X/JanusX&Date"><picture><source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=TreeX-X/JanusX&type=date&theme=dark" /><img alt="Star History Chart" width="600" src="./assets/chart.svg" /></picture></a>\n\n<details><summary>More</summary>Details</details>')
    expect(html).toContain('<picture>')
    expect(html).toContain('prefers-color-scheme: dark')
    expect(html).toContain('srcSet="https://api.star-history.com/chart?repos=TreeX-X/JanusX&amp;type=date&amp;theme=dark"')
    expect(html).toContain('src="./assets/chart.svg"')
    expect(html).toContain('width="600"')
    expect(html).toContain('<details>')
    expect(html).not.toContain('&lt;picture')
  })

  it('removes executable markup, event handlers and non-image data URLs', () => {
    const html = render('<script>alert(1)</script><style>body{display:none}</style><iframe src="https://example.org"></iframe><img src="javascript:alert(1)" onerror="alert(2)"><img src="data:text/html,bad"><a href="javascript:alert(3)">bad</a><source srcset="javascript:bad 2x, https://example.org/good.png 1x">')
    expect(html).not.toMatch(/<script|<style|<iframe|onerror|javascript:|data:text\/html/)
    expect(html).toContain('https://example.org/good.png')
  })

  it('keeps image data URLs and excludes control-character URL tricks', () => {
    expect(render('![image](data:image/png;base64,aGVsbG8=)')).toContain('data:image/png;base64,aGVsbG8=')
    expect(isPreviewImageUrl('java\tscript:alert(1)')).toBe(false)
    expect(isPreviewImageUrl('vbscript:alert(1)')).toBe(false)
    expect(isPreviewImageUrl('C:/workspace/a.png')).toBe(true)
  })
})
