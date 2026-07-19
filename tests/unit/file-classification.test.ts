import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { FileTypeIcon } from '../../src/renderer/src/components/FileTypeIcon'
import { FileTreeItem } from '../../src/renderer/src/components/FileExplorerTool'
import {
  classifyFile,
  getExtension,
  getFileName,
  type FileClassification,
  type FileSemanticKind,
} from '../../src/renderer/src/lib/file-classification'
import { resolveFilePresentation } from '../../src/renderer/src/lib/file-presentation'
import {
  getFileViewType,
  getMonacoLanguage,
} from '../../src/renderer/src/lib/file-utils'
import type { FileNode, GitFileChange } from '../../src/renderer/src/types'

function expectClassification(
  path: string,
  semanticKind: FileSemanticKind,
  viewerType: FileClassification['viewerType'],
  monacoLanguage: string | null,
) {
  expect(classifyFile(path)).toEqual({ semanticKind, viewerType, monacoLanguage })
}

describe('file classification', () => {
  it('resolves directories before names and extensions', () => {
    expect(classifyFile('src/photo.png', 'directory')).toEqual({
      semanticKind: 'folder',
      viewerType: null,
      monacoLanguage: null,
    })
  })

  it('classifies language, markup, data and image extensions case-insensitively', () => {
    expectClassification('src/App.TSX', 'typescript', 'code', 'typescriptreact')
    expectClassification('index.mjs', 'javascript', 'code', 'javascript')
    expectClassification('worker.CJS', 'javascript', 'code', 'javascript')
    expectClassification('tool.py', 'python', 'code', 'python')
    expectClassification('main.rs', 'rust', 'code', 'rust')
    expectClassification('main.go', 'code', 'code', 'go')
    expectClassification('README.MD', 'markdown', 'markdown', 'markdown')
    expectClassification('index.HTML', 'code', 'html', 'html')
    expectClassification('icon.SVG', 'image', 'image', null)
    expectClassification('settings.json', 'data', 'code', 'json')
    expectClassification('config.YAML', 'data', 'code', 'yaml')
    expectClassification('table.csv', 'data', 'code', 'plaintext')
  })

  it('prioritizes special full names, dotfiles and lock files', () => {
    for (const path of [
      'Dockerfile',
      'Dockerfile.dev',
      'Makefile',
      'GNUMakefile',
      'Justfile',
      '.env',
      '.env.local',
      '.gitignore',
      '.gitattributes',
      '.editorconfig',
    ]) {
      expectClassification(path, 'config', 'code', 'plaintext')
    }

    expectClassification('package.json', 'config', 'code', 'json')
    expectClassification('tsconfig.json', 'config', 'code', 'json')
    expectClassification('tsconfig.build.json', 'config', 'code', 'json')
    expectClassification('tsconfig-base.json', 'config', 'code', 'json')
    expectClassification('tsconfig.custom-client.json', 'config', 'code', 'json')
    expectClassification('my-tsconfig.json', 'data', 'code', 'json')
    expectClassification('package-lock.json', 'config', 'code', 'json')
    expectClassification('pnpm-lock.yaml', 'config', 'code', 'yaml')
    expectClassification('Cargo.lock', 'config', 'code', 'plaintext')
    expectClassification('Pipfile.lock', 'config', 'code', 'plaintext')
    expectClassification('uv.lock', 'config', 'code', 'plaintext')
  })

  it('handles multi-suffix, readable text and honest binary fallbacks', () => {
    expectClassification('types.d.ts', 'typescript', 'code', 'typescript')
    expectClassification('bundle.tar.gz', 'archive', 'binary', null)
    expectClassification('notes.txt', 'document', 'code', 'plaintext')
    expectClassification('CHANGELOG', 'document', 'code', 'plaintext')
    expectClassification('manual.docx', 'document', 'binary', null)
    expectClassification('payload.wasm', 'binary', 'binary', null)
    expectClassification('unknown.custom', 'binary', 'binary', null)
    expectClassification('no-extension', 'binary', 'binary', null)
  })

  it('keeps database and archive presentation distinct while using Binary Viewer', () => {
    const database = classifyFile('cache.sqlite3')
    const archive = classifyFile('source.7z')

    expect(database).toEqual({ semanticKind: 'database', viewerType: 'binary', monacoLanguage: null })
    expect(archive).toEqual({ semanticKind: 'archive', viewerType: 'binary', monacoLanguage: null })
    expect(resolveFilePresentation(database)).toMatchObject({ iconKind: 'database', colorToken: 'storage' })
    expect(resolveFilePresentation(archive)).toMatchObject({ iconKind: 'archive', colorToken: 'storage' })
  })
})

describe('file utility compatibility', () => {
  it('preserves the existing public viewer and Monaco categories', () => {
    expect(getFileViewType('photo.webp')).toBe('image')
    expect(getFileViewType('README.md')).toBe('markdown')
    expect(getFileViewType('index.html')).toBe('html')
    expect(getFileViewType('main.cpp')).toBe('code')
    expect(getFileViewType('cache.db')).toBe('binary')
    expect(getFileViewType('source.zip')).toBe('binary')
    expect(getFileViewType('unknown.bin')).toBe('binary')

    expect(getMonacoLanguage('component.tsx')).toBe('typescriptreact')
    expect(getMonacoLanguage('script.jsx')).toBe('javascriptreact')
    expect(getMonacoLanguage('config.yml')).toBe('yaml')
    expect(getMonacoLanguage('styles.scss')).toBe('scss')
    expect(getMonacoLanguage('unknown.bin')).toBe('plaintext')
  })

  it('keeps path helpers case-safe and basename-scoped', () => {
    expect(getFileName('C:\\workspace\\src\\App.TSX')).toBe('App.TSX')
    expect(getExtension('C:\\workspace.name\\src\\App.TSX')).toBe('.tsx')
    expect(getExtension('.gitignore')).toBe('.gitignore')
  })
})

describe('semantic file icon', () => {
  it('renders a local currentColor shape from presentation without changing the label channel', () => {
    const presentation = resolveFilePresentation(classifyFile('src/App.tsx'))
    const markup = renderToStaticMarkup(createElement(FileTypeIcon, { presentation }))

    expect(markup).toContain('data-file-kind="typescript"')
    expect(markup).toContain('stroke="currentColor"')
    expect(markup).toContain('TS')
    expect(markup).not.toContain('App.tsx')
  })

  it('wires production file rows to semantic icons without merging selection, name and Git channels', () => {
    const commonProps = {
      depth: 0,
      expanded: false,
      expandedPaths: new Set<string>(),
      fileChangeMap: new Map<string, GitFileChange>(),
      onSelect: vi.fn(),
      onToggleDirectory: vi.fn(),
      onOpenFile: vi.fn(),
      onOpenContextMenu: vi.fn(),
    }
    const typeScriptNode = {
      name: 'App.tsx',
      path: 'src/App.tsx',
      type: 'file',
    } as FileNode
    const databaseNode = {
      name: 'cache.sqlite3',
      path: 'data/cache.sqlite3',
      type: 'file',
    } as FileNode
    const gitChange = {
      path: 'src/App.tsx',
      status: 'M',
      staged: false,
    } as GitFileChange

    const activeMarkup = renderToStaticMarkup(createElement(FileTreeItem, {
      ...commonProps,
      node: typeScriptNode,
      activeFilePath: typeScriptNode.path,
      fileChange: gitChange,
    }))
    const defaultMarkup = renderToStaticMarkup(createElement(FileTreeItem, {
      ...commonProps,
      node: databaseNode,
      activeFilePath: null,
      fileChange: null,
    }))

    expect(activeMarkup).toContain('data-file-kind="typescript"')
    expect(activeMarkup).toContain('data-selected="true"')
    expect(activeMarkup).toContain('color:#ff7830')
    expect(activeMarkup).toContain('data-git-status="M"')
    expect(activeMarkup.indexOf('data-file-kind="typescript"')).toBeLessThan(
      activeMarkup.indexOf('data-git-status="M"'),
    )
    expect(defaultMarkup).toContain('data-file-kind="database"')
    expect(defaultMarkup).toContain('data-selected="false"')
    expect(defaultMarkup).toContain('color:#999')
    const fileNameTag = defaultMarkup.match(/<span[^>]*data-file-name="cache\.sqlite3"[^>]*>/)?.[0]
    expect(fileNameTag).toBeDefined()
    expect(fileNameTag).not.toContain('style=')
    expect(defaultMarkup).not.toContain('data-git-status=')
  })
})
