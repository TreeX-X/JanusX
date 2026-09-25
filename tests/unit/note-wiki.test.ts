import { describe, expect, it } from 'vitest'
import { noteDirectory, noteWikiView } from '../../src/shared/note-wiki'
import type { NoteReadEntry, NoteReadSnapshot } from '../../src/shared/notes'

const uri = (id: string, repo = 'repo') => 'note://' + repo + '/' + id
const entry = (id: string, title = id, repo = 'repo'): NoteReadEntry => ({ uri: uri(id, repo), relPath: id + '.md', sourceHash: id.repeat(64).slice(0, 64), classification: 'valid', diagnostics: [], doc: { id, title, kind: 'initiative', lifecycle: 'accepted', parent: null, tags: [], body: title.repeat(10), sections: [], acs: [], relations: [] } })
const edge = (from: string, to: string, type = 'parent', repo = 'repo'): NoteReadSnapshot['relations'][number] => ({ sourceUri: uri(from), targetUri: uri(to, repo), type: type as never, declarations: [], resolution: { status: repo === 'repo' ? 'resolved' : 'unavailable', diagnostics: [] } })
const snapshot = (entries: NoteReadEntry[], relations: NoteReadSnapshot['relations'] = []): NoteReadSnapshot => ({ repoId: 'repo', entries, relations, mentions: [], diagnostics: [], coverage: { checkoutRoot: 'C:/fixture', status: 'complete', snapshotHash: 's', diagnostics: [] } })

describe('derived engineering wiki', () => {
  it('orders the directory by parent with deterministic sibling order', () => {
    const source = snapshot([entry('z'), entry('b'), entry('a')], [edge('b', 'a'), edge('z', 'a')])
    const before = JSON.stringify(source)
    expect(noteDirectory(source).map(row => [row.entry.uri, row.depth])).toEqual([[uri('a'), 0], [uri('b'), 1], [uri('z'), 1]])
    expect(JSON.stringify(source)).toBe(before)
    expect(noteDirectory({ ...source, entries: [...source.entries].reverse() })).toEqual(noteDirectory(source))
  })
  it('diagnoses cycles, unavailable and multiple parents without choosing a winner', () => {
    const source = snapshot(['a', 'b', 'c', 'd'].map(id => entry(id)), [edge('a', 'b'), edge('b', 'a'), edge('c', 'absent'), edge('d', 'a'), edge('d', 'b')])
    const result = noteDirectory(source)
    expect(result.filter(row => ['a', 'b'].includes(row.entry.doc!.id)).map(row => [row.depth, row.warning])).toEqual([[0, 'Parent cycle'], [0, 'Parent cycle']])
    expect(result.find(row => row.entry.doc?.id === 'c')?.warning).toBe('Unresolved parent')
    expect(result.find(row => row.entry.doc?.id === 'd')?.warning).toBe('Multiple parents')
  })
  it('keeps same UUID in different repositories distinct and never selects duplicate identity', () => {
    const source = snapshot([entry('a'), entry('b'), entry('b', 'External', 'other'), entry('c'), entry('c')], [edge('a', 'b', 'related-to', 'other')])
    const view = noteWikiView(source, uri('a'))
    expect(view.context.map(row => row.title)).toEqual(['a', 'External'])
    expect(view.entries.has(uri('c'))).toBe(false)
    expect(noteDirectory(source).filter(row => row.entry.uri === uri('c'))).toHaveLength(0)
  })
  it('separates formal edges from Markdown mentions and retains unresolved locators', () => {
    const source = snapshot([entry('a'), entry('b')], [edge('a', 'b', 'depends-on')])
    source.mentions = [{ sourceUri: uri('b'), targetUri: uri('a'), anchor: 'goal', destinations: ['./a.md#goal'], occurrences: [{ destination: './a.md#goal', label: 'A', line: 3 }], resolution: { status: 'resolved', anchorStatus: 'resolved', diagnostics: [] } }, { sourceUri: uri('a'), targetUri: uri('x', 'outside'), destinations: [uri('x', 'outside')], occurrences: [], resolution: { status: 'unavailable', diagnostics: [] } }]
    const view = noteWikiView(source, uri('a'))
    expect(view.outgoing).toHaveLength(1); expect(view.backlinks).toHaveLength(0)
    expect(view.mentions).toHaveLength(1); expect(view.mentionedBy).toHaveLength(1)
    expect(view.unavailable).toEqual([uri('x', 'outside')])
    expect(view.context.map(row => row.uri)).toEqual([uri('a'), uri('b')])
  })
  it('bounds and deduplicates selected, ancestor and one-hop context without implying complete coverage', () => {
    const source = snapshot(['a', 'b', 'c', 'd'].map(id => entry(id)), [edge('a', 'b'), edge('b', 'c'), edge('a', 'd', 'related-to'), edge('d', 'a', 'related-to')])
    source.coverage.status = 'incomplete'
    expect(noteWikiView(source, uri('a')).context.map(row => row.uri)).toEqual(['a', 'b', 'c', 'd'].map(id => uri(id)))
    const limited = noteWikiView(source, uri('a'), 2, 15)
    expect(limited.context.map(row => row.text.length)).toEqual([10, 5]); expect(limited.truncated).toBe(true)
    expect(limited.coverage.status).toBe('incomplete')
  })
})
