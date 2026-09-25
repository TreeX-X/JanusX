import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createHash } from 'node:crypto'
import { stringify } from 'yaml'
import { parseNote } from '@janus-agent/harness-core'
import { SUPPORTED_HARNESS_PROFILE } from '@janus-agent/harness-node'
import { applyFlattenPreview, flattenNotes, main, normalizeNoteBody, rewriteRelativeLinks, sourceParts } from '../../scripts/migrate-agent-notes.mjs'
const repoId='972afef3-2fc7-49de-a3ee-7e041225d28c'
const id='12345678-1234-4234-8234-123456789abc', otherId='22345678-1234-4234-8234-123456789abc', fixedId='32345678-1234-4234-8234-123456789abc'
const moving='.agents/notes/implemented/feature/2026-09-20-a.md'
const other='.agents/notes/implemented/feature/2026-09-20-b.md'
const fixed='.agents/notes/2026-09-20-fixed.md'
const next='.agents/notes/2026-09-20-a--12345678.md'
const roots:string[]=[]
const sha=(s:string)=>createHash('sha256').update(s).digest('hex')
function note(noteId=id,extra=''){return '---\n'+stringify({schema:'harness-note/1',id:noteId,kind:'decision',lifecycle:'draft',created:'2026-09-20'})+'---\n# Title\n\n## Problem\n\nFacts.\n'+extra}
async function fixture(files:Record<string,string>={ [moving]:note() }){
 const root=await mkdtemp(join(tmpdir(),'note-flat-'));roots.push(root)
 await mkdir(join(root,'.agents/notes'),{recursive:true})
 await writeFile(join(root,'.agents/harness.json'),JSON.stringify({schemaVersion:1,repoId,name:'flat test',profile:SUPPORTED_HARNESS_PROFILE}))
 for(const [path,body] of Object.entries(files)){await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),body)}
 return root
}
afterEach(async()=>{for(const root of roots.splice(0)) await rm(root,{recursive:true,force:true})})
describe('flat Note organization',()=>{
 it('rebases moving and stationary Notes, source/image/root/sibling targets, reference definitions and titles from an explicit root',async()=>{
  const inlineExample='\u0060[example](../../../../not-real.md)\u0060'
  const body=[
   '[moving](./2026-09-20-b.md?view=raw#part "Title")',
   '[fixed](../../2026-09-20-fixed.md)', '[source](../../../../src/file.ts#L3)',
   '![image](<../../../../images/a (1).png> "Image title")',
   '[root](../../../../README.md)', '[absolute](/README.md#root)',
   '[sibling](../../../../../sibling/doc.md)', '[reference][ref]',
   '[ref]: ../../../../src/file.ts?raw=true#L4 "Reference title"',
   inlineExample,'~~~md','[example](../../../../not-real.md)','~~~',
   '    [example](../../../../not-real.md)',
  ].join('\n\n')
  const root=await fixture({[moving]:note(id,body),[other]:note(otherId),[fixed]:note(fixedId,'[inbound](./implemented/feature/2026-09-20-a.md#part)'), 'src/file.ts':'source','README.md':'readme','images/a (1).png':'image'})
  expect(root).not.toBe(process.cwd())
  const preview=await flattenNotes(root)
  expect(preview.counts).toMatchObject({total:3,nested:2,ready:3,blocked:0})
  expect(await readFile(join(root,moving),'utf8')).toBe(note(id,body))
  await applyFlattenPreview(root,preview)
  const after=sourceParts(await readFile(join(root,next),'utf8')).body
  for(const expected of [
   '[moving](./2026-09-20-b--22345678.md?view=raw#part "Title")',
   '[fixed](./2026-09-20-fixed.md)', '[source](../../src/file.ts#L3)',
   '![image](<../../images/a%20%281%29.png> "Image title")', '[root](../../README.md)',
   '[absolute](/README.md#root)', '[sibling](../../../sibling/doc.md)',
   '[reference][ref]', '[ref]: ../../src/file.ts?raw=true#L4 "Reference title"',
   inlineExample, '~~~md\n\n[example](../../../../not-real.md)\n\n~~~',
   '    [example](../../../../not-real.md)',
  ])expect(after).toContain(expected)
  expect(sourceParts(await readFile(join(root,fixed),'utf8')).body).toContain('[inbound](./2026-09-20-a--12345678.md#part)')
  await expect(access(join(root,moving))).rejects.toThrow()
  const repeat=await flattenNotes(root,{apply:true})
  expect(repeat.counts).toMatchObject({total:3,nested:0,ready:0,blocked:0})
 })
 it('preserves UTF-8/CRLF raw bytes, body hash, identity and creation date in provenance',async()=>{
  const before=note(id,'Unicode: 文档 café 🎯\n').replaceAll('\n','\r\n')
  const root=await fixture({[moving]:before}),preview=await flattenNotes(root)
  await applyFlattenPreview(root,preview)
  const meta=parseNote(await readFile(join(root,next),'utf8')).meta
  expect(meta).toMatchObject({id,created:'2026-09-20'})
  const provenance=meta.extensions!.r6Organization as any
  expect(Buffer.from(provenance.originalSourceBase64,'base64').toString('utf8')).toBe(before)
  expect(provenance.sourceHash).toBe(sha(before))
  expect(provenance.originalBodyHash).toBe(sha(sourceParts(before).body))
 })
 it('rejects destination collisions during preview and after preview without changing sources',async()=>{
  const root=await fixture(),preview=await flattenNotes(root)
  await writeFile(join(root,next),note(otherId))
  await expect(applyFlattenPreview(root,preview)).rejects.toThrow('Destination collision')
  expect(await readFile(join(root,moving),'utf8')).toBe(note())
  expect((await flattenNotes(root)).counts.blocked).toBeGreaterThan(0)
 })
 it('rejects source conflicts before any create/delete, including stationary inbound writers',async()=>{
  const root=await fixture({[moving]:note(),[fixed]:note(fixedId,'[link](./implemented/feature/2026-09-20-a.md)')})
  const preview=await flattenNotes(root)
  await writeFile(join(root,fixed),note(fixedId,'Concurrent edit.'))
  await expect(applyFlattenPreview(root,preview)).rejects.toThrow('Source conflict')
  await expect(access(join(root,next))).rejects.toThrow()
  expect(await readFile(join(root,moving),'utf8')).toBe(note())
 })
 it('rejects pending recovery, a different checkout, and escaping destinations',async()=>{
  const root=await fixture(),preview=await flattenNotes(root)
  await expect(applyFlattenPreview(await fixture(),preview)).rejects.toThrow('checkout')
  const escaped=structuredClone(preview);escaped.rows[0].newPath='.agents/notes/../../escape.md'
  await expect(applyFlattenPreview(root,escaped)).rejects.toThrow('invalid asset path')
  await mkdir(join(root,'.agents/.local/transactions/unfinished'),{recursive:true})
  await expect(applyFlattenPreview(root,preview)).rejects.toThrow('requires recovery')
  expect(await readFile(join(root,moving),'utf8')).toBe(note())
 })
 it('rejects non-roundtrippable UTF-8 sources',async()=>{
  const root=await fixture()
  await writeFile(join(root,moving),Buffer.concat([Buffer.from(note()),Buffer.from([0xff])]))
  expect((await flattenNotes(root)).counts.blocked).toBe(1)
 })
 it('cleans displayed legacy metadata, retains rejection reasons and skips code examples idempotently',()=>{
  const before=note().replace('# Title','# Agent Note: Topic')+'\nStatus: rejected — Keep the compatibility constraint.\n\n~~~\nStatus: proposed\n# Agent Note: example\n~~~\n'
  const normalized=normalizeNoteBody(before)
  expect(normalized.raw).toContain('# Topic')
  expect(normalized.raw).toContain('Historical disposition: Keep the compatibility constraint.')
  expect(normalized.raw).toContain('~~~\nStatus: proposed\n# Agent Note: example\n~~~')
  expect(normalizeNoteBody(normalized.raw).raw).toBe(normalized.raw)
 })
 it('preserves nested labels, balanced destinations and unused reference definitions',()=>{
  const raw=note(id,'[**label**](../../../../docs/a(b).md "title")\n\n[unused]: <../../../../docs/a b.md> \'title\'\n')
  const result=sourceParts(rewriteRelativeLinks(raw,moving,next,new Map(),process.cwd())).body
  expect(result).toContain('[**label**](../../docs/a%28b%29.md "title")')
  expect(result).toContain('[unused]: <../../docs/a%20b.md> \'title\'')
 })
 it('rewrites linked images in destination order and maps root-relative moved targets',()=>{
  const raw=note(id,'[![alt](../../../../images/pic.png)](./2026-09-20-b.md?x=1&amp;y=2#part "title")\n\n[root](/.agents/notes/implemented/feature/2026-09-20-b.md)')
  const mapped=new Map([[other,'.agents/notes/2026-09-20-b--22345678.md']])
  const body=sourceParts(rewriteRelativeLinks(raw,moving,next,mapped,process.cwd())).body
  expect(body).toContain('[![alt](../../images/pic.png)](./2026-09-20-b--22345678.md?x=1&amp;y=2#part "title")')
  expect(body).toContain('[root](/.agents/notes/2026-09-20-b--22345678.md)')
 })
 it('rejects an escaping CLI report before commit and documents preview/commit flags',async()=>{
  const root=await fixture()
  await expect(main(['--root',root,'--flatten','--commit','--report','../escape.json'])).rejects.toThrow('inside the checkout')
  expect(await readFile(join(root,moving),'utf8')).toBe(note())
  await expect(access(join(root,next))).rejects.toThrow()
  await expect(main(['--root',root,'--commit'])).rejects.toThrow('--commit requires --flatten')
 })

})
