import { classifyFile } from './file-classification'
import type { FileViewType } from './file-classification'

export type { FileViewType } from './file-classification'
export { getExtension, getFileName } from './file-classification'

export function getFileViewType(filePath: string): FileViewType {
  return classifyFile(filePath).viewerType ?? 'binary'
}

export function getMonacoLanguage(filePath: string): string {
  return classifyFile(filePath).monacoLanguage ?? 'plaintext'
}
