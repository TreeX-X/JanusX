export type FileViewType = 'code' | 'markdown' | 'html' | 'image' | 'binary'

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp']
const MARKDOWN_EXTS = ['.md', '.markdown']
const HTML_EXTS = ['.html', '.htm']
const TEXT_EXTS = [
  '.ts', '.tsx', '.js', '.jsx', '.json', '.yml', '.yaml', '.css', '.scss',
  '.less', '.py', '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.hpp',
  '.sh', '.bash', '.zsh', '.ps1', '.bat', '.cmd',
  '.xml', '.toml', '.ini', '.cfg', '.conf',
  '.txt', '.env', '.gitignore', '.gitattributes', '.editorconfig',
  '.prettierrc', '.eslintrc', '.babelrc',
  '.lock', '.log', '.csv', '.tsv', '.sql', '.graphql', '.prisma',
]

export function getFileViewType(filePath: string): FileViewType {
  const ext = getExtension(filePath)
  if (IMAGE_EXTS.includes(ext)) return 'image'
  if (MARKDOWN_EXTS.includes(ext)) return 'markdown'
  if (HTML_EXTS.includes(ext)) return 'html'
  if (TEXT_EXTS.includes(ext)) return 'code'
  return 'binary'
}

export function getExtension(filePath: string): string {
  const dot = filePath.lastIndexOf('.')
  return dot >= 0 ? filePath.slice(dot).toLowerCase() : ''
}

export function getFileName(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || filePath
}

export function getMonacoLanguage(filePath: string): string {
  const ext = getExtension(filePath)
  const map: Record<string, string> = {
    '.ts': 'typescript', '.tsx': 'typescriptreact',
    '.js': 'javascript', '.jsx': 'javascriptreact',
    '.json': 'json', '.yml': 'yaml', '.yaml': 'yaml',
    '.css': 'css', '.scss': 'scss', '.less': 'less',
    '.py': 'python', '.rb': 'ruby', '.go': 'go', '.rs': 'rust',
    '.java': 'java', '.c': 'c', '.cpp': 'cpp', '.h': 'c', '.hpp': 'cpp',
    '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell',
    '.ps1': 'powershell', '.bat': 'bat', '.cmd': 'bat',
    '.xml': 'xml', '.html': 'html', '.htm': 'html',
    '.md': 'markdown', '.markdown': 'markdown',
    '.sql': 'sql', '.graphql': 'graphql', '.prisma': 'prisma',
    '.toml': 'toml', '.ini': 'ini', '.cfg': 'ini',
    '.txt': 'plaintext', '.env': 'plaintext',
    '.log': 'plaintext', '.csv': 'plaintext',
  }
  return map[ext] || 'plaintext'
}
