import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import { defaultUrlTransform, type UrlTransform } from 'react-markdown'
import { parseSrcset, stringifySrcset } from 'srcset'
import type { Root, Element } from 'hast'
import type { PluggableList } from 'unified'
import { rehypeMarkdownSourceBlocks } from './markdown-scroll'
import { isPreviewImageUrl } from './local-asset-resolver'
export { isPreviewImageUrl } from './local-asset-resolver'

function rehypePreviewImages() {
  return (tree: Root) => {
    const visit = (node: Root | Element) => {
      for (const child of node.children) {
        if (child.type !== 'element') continue
        if (child.tagName === 'img' && typeof child.properties.src === 'string' && !isPreviewImageUrl(child.properties.src)) delete child.properties.src
        if ((child.tagName === 'img' || child.tagName === 'source') && typeof child.properties.srcSet === 'string') {
          child.properties.srcSet = stringifySrcset(parseSrcset(child.properties.srcSet).filter(candidate => isPreviewImageUrl(candidate.url)))
        }
        visit(child)
      }
    }
    visit(tree)
  }
}

const schema = {
  ...defaultSchema,
  strip: [...(defaultSchema.strip ?? []), 'style', 'iframe', 'object', 'embed', 'form'],
  attributes: {
    ...defaultSchema.attributes,
    img: [...(defaultSchema.attributes?.img ?? []), 'srcSet', 'sizes'],
    source: [...(defaultSchema.attributes?.source ?? []), 'media', 'type', 'sizes'],
  },
  protocols: { ...defaultSchema.protocols, src: ['http', 'https', 'data', 'file'] },
}

export const fileMarkdownPlugins: PluggableList = [rehypeRaw, [rehypeSanitize, schema], rehypePreviewImages]
export const scrollingMarkdownPlugins: PluggableList = [...fileMarkdownPlugins, rehypeMarkdownSourceBlocks]
export const previewUrlTransform: UrlTransform = (value, key, node) =>
  key === 'src' && node.tagName === 'img' && isPreviewImageUrl(value) ? value : defaultUrlTransform(value)
