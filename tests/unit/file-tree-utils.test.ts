import { describe, expect, it } from 'vitest'
import {
  applyLoadedChildren,
  collectDirectoryPathsToSearchLoad,
  collectLoadedDirectoryPaths,
  filterFileTree,
  getParentPath,
  isPathInScope,
  pruneExpandedPaths,
  remapPath,
} from '../../src/renderer/src/features/workspace/file-tree'
import type { FileNode } from '../../src/renderer/src/types'

const tree: FileNode[] = [
  {
    name: 'src',
    path: 'src',
    type: 'directory',
    loaded: true,
    hasChildren: true,
    children: [
      {
        name: 'components',
        path: 'src/components',
        type: 'directory',
        loaded: true,
        hasChildren: true,
        children: [
          { name: 'Button.tsx', path: 'src/components/Button.tsx', type: 'file' },
          { name: 'Modal.tsx', path: 'src/components/Modal.tsx', type: 'file' },
        ],
      },
      {
        name: 'utils',
        path: 'src/utils',
        type: 'directory',
        loaded: false,
        hasChildren: true,
        children: [],
      },
      { name: 'index.ts', path: 'src/index.ts', type: 'file' },
    ],
  },
  { name: 'README.md', path: 'README.md', type: 'file' },
]

describe('file-tree path utils', () => {
  it('getParentPath handles nested, root-level and backslash paths', () => {
    expect(getParentPath('src/components/Button.tsx')).toBe('src/components')
    expect(getParentPath('README.md')).toBe('')
    expect(getParentPath('src\\utils')).toBe('src')
  })

  it('isPathInScope matches self and descendants only', () => {
    expect(isPathInScope('src/utils/a.ts', 'src/utils')).toBe(true)
    expect(isPathInScope('src/utils', 'src/utils')).toBe(true)
    expect(isPathInScope('src/utils2/a.ts', 'src/utils')).toBe(false)
    expect(isPathInScope('anything', '')).toBe(true)
  })

  it('remapPath rewrites the renamed prefix and leaves others intact', () => {
    expect(remapPath('src/utils', 'src/utils', 'src/helpers')).toBe('src/helpers')
    expect(remapPath('src/utils/a.ts', 'src/utils', 'src/helpers')).toBe('src/helpers/a.ts')
    expect(remapPath('src/utils2/a.ts', 'src/utils', 'src/helpers')).toBe('src/utils2/a.ts')
  })
})

describe('collectLoadedDirectoryPaths', () => {
  it('returns only loaded directories, at any depth', () => {
    expect(collectLoadedDirectoryPaths(tree)).toEqual(['src', 'src/components'])
  })
})

describe('applyLoadedChildren', () => {
  it('re-attaches refreshed children and updates loaded/hasChildren', () => {
    const fresh: FileNode[] = [
      { name: 'src', path: 'src', type: 'directory', loaded: false, hasChildren: true, children: [] },
    ]
    const refreshed = applyLoadedChildren(fresh, new Map([
      ['src', [{ name: 'new.ts', path: 'src/new.ts', type: 'file' } as FileNode]],
    ]))

    expect(refreshed[0].loaded).toBe(true)
    expect(refreshed[0].hasChildren).toBe(true)
    expect(refreshed[0].children).toEqual([{ name: 'new.ts', path: 'src/new.ts', type: 'file' }])
  })

  it('marks refreshed empty directories as loaded with no children', () => {
    const fresh: FileNode[] = [
      { name: 'src', path: 'src', type: 'directory', loaded: false, hasChildren: true, children: [] },
    ]
    const refreshed = applyLoadedChildren(fresh, new Map([['src', []]]))

    expect(refreshed[0].loaded).toBe(true)
    expect(refreshed[0].hasChildren).toBe(false)
  })

  it('leaves directories without refreshed data untouched', () => {
    const refreshed = applyLoadedChildren(tree, new Map())
    expect(refreshed).toEqual(tree)
  })
})

describe('filterFileTree', () => {
  it('keeps matching files and expands ancestor directories', () => {
    const { nodes, expandedDirs } = filterFileTree(tree, 'button')

    expect(nodes).toHaveLength(1)
    expect(nodes[0].path).toBe('src')
    expect(nodes[0].children?.[0].path).toBe('src/components')
    expect(nodes[0].children?.[0].children?.map((n) => n.path)).toEqual(['src/components/Button.tsx'])
    expect(expandedDirs).toEqual(new Set(['src', 'src/components']))
  })

  it('keeps a directory whose own name matches, with original children', () => {
    const { nodes, expandedDirs } = filterFileTree(tree, 'utils')

    expect(nodes[0].path).toBe('src')
    expect(nodes[0].children?.map((n) => n.path)).toEqual(['src/utils'])
    expect(expandedDirs).toEqual(new Set(['src']))
  })

  it('matches relative path segments, not only the leaf name', () => {
    const { nodes, expandedDirs } = filterFileTree(tree, 'components/button')

    expect(nodes[0].path).toBe('src')
    expect(nodes[0].children?.[0].path).toBe('src/components')
    expect(nodes[0].children?.[0].children?.map((n) => n.path)).toEqual(['src/components/Button.tsx'])
    expect(expandedDirs).toEqual(new Set(['src', 'src/components']))
  })

  it('returns empty results when nothing matches', () => {
    const { nodes, expandedDirs } = filterFileTree(tree, 'no-such-entry')
    expect(nodes).toEqual([])
    expect(expandedDirs.size).toBe(0)
  })

  it('is case-insensitive', () => {
    const { nodes } = filterFileTree(tree, 'readme')
    expect(nodes.map((n) => n.path)).toContain('README.md')
  })
})

describe('collectDirectoryPathsToSearchLoad', () => {
  it('includes unloaded root dirs and name-matching unloaded nested dirs', () => {
    const withUnloadedRoot: FileNode[] = [
      {
        name: 'packages',
        path: 'packages',
        type: 'directory',
        loaded: false,
        hasChildren: true,
        children: [],
      },
      ...tree,
    ]

    expect(collectDirectoryPathsToSearchLoad(withUnloadedRoot, 'utils')).toEqual([
      'packages',
      'src/utils',
    ])
  })

  it('includes expanded unloaded dirs even when the name does not match', () => {
    const expandedOnly: FileNode[] = [
      {
        name: 'src',
        path: 'src',
        type: 'directory',
        loaded: true,
        hasChildren: true,
        children: [
          {
            name: 'hidden-branch',
            path: 'src/hidden-branch',
            type: 'directory',
            loaded: false,
            hasChildren: true,
            children: [],
          },
        ],
      },
    ]

    expect(
      collectDirectoryPathsToSearchLoad(expandedOnly, 'button', 40, new Set(['src/hidden-branch'])),
    ).toEqual(['src/hidden-branch'])
  })

  it('respects the load limit', () => {
    const many: FileNode[] = Array.from({ length: 5 }, (_, index) => ({
      name: `dir-${index}`,
      path: `dir-${index}`,
      type: 'directory' as const,
      loaded: false,
      hasChildren: true,
      children: [],
    }))

    expect(collectDirectoryPathsToSearchLoad(many, 'dir', 3)).toHaveLength(3)
  })

  it('returns empty for blank queries', () => {
    expect(collectDirectoryPathsToSearchLoad(tree, '   ')).toEqual([])
  })
})

describe('pruneExpandedPaths', () => {
  it('drops expanded paths that are no longer directories in the tree', () => {
    const expanded = new Set(['src', 'src/components', 'src/utils', 'gone'])
    const pruned = pruneExpandedPaths(expanded, tree)

    expect(pruned).toEqual(new Set(['src', 'src/components', 'src/utils']))
  })

  it('returns the same set instance when nothing needs pruning', () => {
    const expanded = new Set(['src', 'src/components'])
    expect(pruneExpandedPaths(expanded, tree)).toBe(expanded)
  })
})
