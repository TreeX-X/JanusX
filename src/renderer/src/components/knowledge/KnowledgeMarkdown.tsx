import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { MARKDOWN_COMPONENTS } from '../viewers/markdown-components'
import styles from './MemoryReviewTool.module.css'

/** Reuse the application's Markdown renderer without HTML execution or automatic source image reads. */
export function KnowledgeMarkdown({ content }: { content: string }) {
  return <div className={`${styles.markdown} markdown-preview`} data-knowledge-markdown>
    <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{ ...MARKDOWN_COMPONENTS,
      img: ({ alt }) => <span>{alt}</span>,
    }}>{content}</ReactMarkdown>
  </div>
}
