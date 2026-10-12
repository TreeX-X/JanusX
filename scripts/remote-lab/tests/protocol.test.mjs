import test from 'node:test'
import assert from 'node:assert/strict'
import { LabHost, OutputTracker } from '../protocol.mjs'

test('pending applicants cannot start terminals and test identity never counts as real authentication', () => {
  const host=new LabHost(); host.join('alice');assert.throws(()=>host.request('alice',{id:'one',method:'start'}),/批准/)
  host.identify('alice',{provider:'transport-test',subject:'alice'});assert.throws(()=>host.approve('alice'),/真实登录/)
  host.approve('alice',true);assert.equal(host.members.get('alice').role,'member')
})
function approvedHost(options) { const host=new LabHost(options);host.join('alice');host.identify('alice',{provider:'github',subject:'123'});host.approve('alice');return host }
test('duplicate start/input/close has one effect, conflicting requests are rejected, other terminals survive', () => {
  const host=approvedHost(),start={id:'start',method:'start'},a=host.request('alice',start),b=host.request('alice',start)
  assert.equal(a.terminalId,b.terminalId)
  const second=host.request('alice',{id:'second',method:'start'}),input={id:'input',method:'input',params:{terminalId:a.terminalId,text:'中文🙂\n多行'}}
  assert.equal(host.request('alice',input).frame.seq,host.request('alice',input).frame.seq)
  assert.throws(()=>host.request('alice',{...input,params:{...input.params,text:'different'}}),/内容不同/)
  const close={id:'close',method:'close',params:{terminalId:a.terminalId}};host.request('alice',close);host.request('alice',close)
  assert.deepEqual(host.effectCounts,{start:2,input:1,close:1});assert.equal(host.terminals.get(second.terminalId).running,true)
})
test('revocation denies cached successful requests and reconnection, including pending authentication completion', () => {
  const host=approvedHost(),request={id:'start',method:'start'};host.request('alice',request);host.revoke('alice')
  assert.throws(()=>host.request('alice',request),/撤销/);assert.throws(()=>host.join('alice'),/撤销/)
  host.join('bob');host.revoke('bob',true);assert.throws(()=>host.identify('bob',{provider:'google',subject:'g1'}),/不可认证/)
})
test('bounded replay resets explicitly, paginates under DataChannel limits and resumes contiguous output', () => {
  const host=approvedHost({bufferSize:40}),tracker=new OutputTracker()
  for(let i=0;i<60;i++)host.append('x'.repeat(4096))
  let value=host.replay(0,'old');assert.equal(value.reset,true);assert.equal(value.reason,'host-generation');assert.ok(new TextEncoder().encode(JSON.stringify(value)).length<55000)
  while(true){tracker.applyReplay(value);if(!value.more)break;value=host.replay(tracker.lastSeq,tracker.epoch)}
  assert.equal(tracker.lastSeq,60);assert.equal(tracker.count,40);assert.equal(tracker.resets,1)
  const frame=host.append('next');assert.equal(tracker.accept(frame),true);assert.equal(tracker.accept(frame),false);assert.equal(tracker.duplicates,1)
})
test('gap detection keeps the last contiguous cursor so replay can recover missed frames', () => {
  const tracker=new OutputTracker();tracker.accept({epoch:'one',seq:1,text:'A'});assert.equal(tracker.accept({epoch:'one',seq:3,text:'C'}),false);assert.equal(tracker.lastSeq,1)
  tracker.applyReplay({epoch:'one',reset:false,latest:3,frames:[{epoch:'one',seq:2,text:'B'},{epoch:'one',seq:3,text:'C'}]})
  assert.equal(tracker.text,'ABC');assert.equal(tracker.gaps,1)
})
