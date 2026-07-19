import type { FileClassification, FileSemanticKind } from './file-classification'

export type FileIconColorToken =
  | 'folder'
  | 'code'
  | 'markup'
  | 'data'
  | 'media'
  | 'storage'
  | 'muted'

export interface FilePresentation extends FileClassification {
  iconKind: FileSemanticKind
  colorToken: FileIconColorToken
}

const COLOR_TOKENS: Record<FileSemanticKind, FileIconColorToken> = {
  folder: 'folder',
  typescript: 'code',
  javascript: 'code',
  python: 'code',
  rust: 'code',
  code: 'code',
  markdown: 'markup',
  data: 'data',
  image: 'media',
  database: 'storage',
  archive: 'storage',
  config: 'muted',
  document: 'muted',
  binary: 'muted',
}

export function resolveFilePresentation(
  classification: FileClassification,
): FilePresentation {
  return {
    ...classification,
    iconKind: classification.semanticKind,
    colorToken: COLOR_TOKENS[classification.semanticKind],
  }
}
