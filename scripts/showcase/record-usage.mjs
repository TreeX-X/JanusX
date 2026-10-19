// Authored native session fixtures; real telemetry parser, ledger, aggregation and UI.
import { expect } from 'playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFixture } from './cli-fixture.mjs';
import { buildEvidence } from './blueprint-fixture.mjs';
import { style } from './showcase-config.mjs';
import { prepareRepo, launchApp, skipGate, ensureWorkspace, ensureSidebarExpanded, openWorkspace,
  snapper, saveManifest, runRecord, sleep, AW, AH } from './record-lib.mjs';

const captions = Object.fromEntries(['ready','drawer','focus','history','week','filter','trend','heatmap','cost'].map(key => [key,{text:key}]));
await runRecord(async ctx => {
  const fixture = await createFixture(ctx);
  const { recordingRoot, rawDir, repoPath } = await prepareRepo('usage', { repoParent: fixture.fixtureRoot, repoName: 'Atlas' });
  ctx.recordingRoot = recordingRoot;
  const ids = { claude: randomUUID(), codex: randomUUID() }, native = { claude: randomUUID(), codex: randomUUID() };
  const now = Date.now(), midnight = new Date(new Date().setHours(0,0,0,0)).getTime();
  const expected = { claude: { input: 0, output: 0, read: 0, write: 0, total: 0 }, codex: { input: 0, output: 0, read: 0, write: 0, total: 0 } };
  const claudeRows = [], codexRows = [{ timestamp: new Date(midnight - 6 * 86400000).toISOString(), ordinal: 0, type: 'session_meta', payload: { id: native.codex, cwd: repoPath } },
    { type: 'turn_context', ordinal: 1, payload: { model: 'gpt-5.4', cwd: repoPath } }];
  let codexInput = 0, codexOutput = 0, codexRead = 0;
  for (let day = 6; day >= 0; day--) for (let turn = 0; turn < 3; turn++) {
    const at = day === 0 ? Math.min(now - 1000, midnight + (9 + turn * 3) * 3600000) : midnight - day * 86400000 + (9 + turn * 3) * 3600000;
    const input = 1200 + (7-day)*220 + turn*130, output = 400 + (7-day)*75 + turn*65, cached = 12500 + (7-day)*930 + turn*800, written = turn === 0 ? 2200 : 0;
    claudeRows.push({ type: 'assistant', uuid: randomUUID(), sessionId: native.claude, cwd: repoPath, timestamp: new Date(at).toISOString(),
      message: { id: randomUUID(), role: 'assistant', model: 'claude-sonnet-4-5', content: [{type:'text',text:'Authored usage sample for Atlas.'}], stop_reason:'end_turn',
        usage: { input_tokens: input, output_tokens: output, cache_read_input_tokens: cached, cache_creation_input_tokens: written } } });
    const c = expected.claude; c.input += input; c.output += output; c.read += cached; c.write += written; c.total += input+output+cached+written;
    codexInput += input*2 + cached; codexOutput += output*2; codexRead += cached;
    codexRows.push({ timestamp: new Date(at + 500).toISOString(), ordinal: codexRows.length, type:'event_msg', payload:{ type:'token_count', info:{
      total_token_usage:{input_tokens:codexInput,output_tokens:codexOutput,cached_input_tokens:codexRead,total_tokens:codexInput+codexOutput},
      last_token_usage:{input_tokens:input*2+cached,output_tokens:output*2,cached_input_tokens:cached,total_tokens:input*2+cached+output*2}, model_context_window:272000 } } });
  }
  expected.codex = { input: codexInput-codexRead, output: codexOutput, read: codexRead, total: codexInput+codexOutput };
  const key = repoPath.replace(/[^a-zA-Z0-9]/g, '-');
  const claudeDir = join(fixture.fixtureRoot,'.claude','projects',key), codexDir = join(fixture.env.CODEX_HOME,'sessions');
  await mkdir(claudeDir,{recursive:true}); await mkdir(codexDir,{recursive:true});
  await writeFile(join(claudeDir, native.claude+'.jsonl'),claudeRows.map(row=>JSON.stringify(row)).join('\n')+'\n');
  await writeFile(join(codexDir, 'rollout-'+native.codex+'.jsonl'),codexRows.map(row=>JSON.stringify(row)).join('\n')+'\n');
  const dataDir = join(fixture.fixtureRoot,'user-data','janusx'); await mkdir(dataDir,{recursive:true});
  await writeFile(join(dataDir,'terminal-context-ledger.json'),JSON.stringify({ version:1, terminals:Object.fromEntries(Object.entries(ids).map(([engine,id])=>[id,{
    engine,sessionId:native[engine],updatedAt:now,source:'hook',modelSegments:[] }])) }));
  const { application,page } = await launchApp(fixture.fixtureRoot, fixture.claudeConfig,{env:fixture.env}); Object.assign(ctx,{application,page});
  const win = await application.browserWindow(page); await win.evaluate((win,size)=>win.setContentSize(size.width,size.height),{width:AW,height:AH});
  await skipGate(page); await ensureWorkspace(page,'Atlas · 示例用量',repoPath); await ensureSidebarExpanded(page); await openWorkspace(page,'Atlas · 示例用量');
  const workspace = (await page.evaluate(()=>window.electron.workspace.list())).find(w=>w.path===repoPath);
  for (const preset of ['claude','codex']) {
    await page.evaluate(input=>window.electron.terminal.create(input),{id:ids[preset],workspaceId:workspace.id,cwd:repoPath,shell:'powershell.exe',preset,cols:140,rows:35});
    await sleep(5500);
    console.log('created',preset);
  }
  const tab = preset=>page.locator(`main [data-tab-id="terminal:${ids[preset]}"]`);
  for (const preset of ['claude','codex']) {
    await tab(preset).click(); const input = page.locator('.xterm-helper-textarea:visible');
    for(let i=0;i<60;i++) {
      const text=await page.locator('.xterm-rows:visible').innerText(); await input.focus();
      if(/Dark mode|Light mode/.test(text)) await input.press('Enter');
      else if(/Is this a project you created|Yes, I trust this folder/.test(text)) {await input.press('ArrowDown');await input.press('Enter');}
      else if(/Detected a custom API key/.test(text)) {await input.press('ArrowUp');await input.press('Enter');}
      else if(/Make auto mode your default permission mode|Set up the Codex agent sandbox/.test(text)) {await input.press('ArrowDown');await input.press('Enter');}
      else if(/Trust this folder\?/.test(text)) await input.press('Enter');
      else if(/Hooks need review|new MCP servers/.test(text)) await input.press('Escape');
      else if((preset==='claude' && /Claude Code v/.test(text) && /for shortcuts|shift\+tab to cycle/.test(text))
        || (preset==='codex' && /context left|Ask Codex/.test(text))) break;
      if(i===59) throw new Error(`${preset}: CLI input did not become ready`);
      await sleep(600);
    }
  }
  const snapshots = {};
  for(const preset of ['claude','codex']) {
    snapshots[preset] = await page.evaluate(input=>window.electron.system.getRuntimeTelemetry(input),{terminalId:ids[preset],preset,cwd:repoPath});
    expect(snapshots[preset]?.totalTokens).toBe(expected[preset].total);
  }
  await expect.poll(async()=> (await page.evaluate(q=>window.electron.system.listUsageLedger(q),{start:midnight-7*86400000,end:Date.now()+1000,limit:2000})).records.length,{timeout:40000}).toBe(42);
  await tab('claude').click(); await sleep(11000);
  const frames=[],checkpoints=[]; const motion=snapper(page,rawDir,frames,null,{motion:4,hover:30,click:8,typing:6,settleMs:150,travelPixelsPerStep:40});
  async function point(stage,delay=190){await motion.rest(stage,delay);checkpoints.push({stage,frame:frames.length-1,text:await page.locator('body').innerText()});console.log(stage,frames.length-1);}
  await motion.snap({x:AW-80,y:AH-45},false,160,'ready');
  await motion.clickSnap(page.getByRole('button',{name:'切换用量面板',exact:true}),'drawer');
  await expect(page.getByRole('region',{name:'用量',exact:true})).toContainText(expected.claude.total.toLocaleString('en-US'));
  await point('drawer',250);
  await motion.clickSnap(tab('codex'),'focus'); await point('focus',230);
  await motion.clickSnap(page.getByRole('button',{name:'切换用量面板',exact:true}),'history');
  await motion.clickSnap(page.locator('div[title]').filter({has:page.getByText('JanusX',{exact:true})}).first(),'history');
  await motion.clickSnap(page.getByRole('dialog').getByRole('button',{name:'用量',exact:true}),'history');
  const panel=page.getByRole('region',{name:'用量统计',exact:true}); await expect(panel).toBeVisible(); await point('history');
  await motion.clickSnap(panel.getByRole('button',{name:'本周',exact:true}),'week'); await sleep(500); await point('week',220);
  await motion.clickSnap(panel.getByRole('button',{name:'Claude Code',exact:true}),'filter'); await sleep(500); await point('filter',220);
  const chart=panel.getByRole('group',{name:'时间趋势',exact:true});
  await chart.evaluate(el=>el.scrollIntoView({block:'center',behavior:'smooth'}));
  for(let i=0;i<8;i++){await sleep(40);await motion.rest('trend',5);}
  await motion.moveSnap(chart,'trend',200); await point('trend');
  await panel.getByTestId('usage-summary').evaluate(el=>el.scrollIntoView({block:'start',behavior:'smooth'}));
  for(let i=0;i<8;i++){await sleep(40);await motion.rest('cost',5);}
  await motion.clickSnap(panel.getByRole('button',{name:'全部',exact:true}),'heatmap'); await sleep(500); await point('heatmap',220);
  const posterFrame=frames.length-1;
  const last=frames.at(-1),first=frames[0];for(const opacity of [.8,.6,.4,.2,0])frames.push({...last,delay:80,click:false,opacity,transition:'loop-reset'});for(const opacity of [.2,.4,.6,.8,1])frames.push({...first,delay:80,click:false,opacity,transition:'loop-reset'});
  await saveManifest(recordingRoot,{name:'feature-usage',frames,captions,posterFrame,createdAt:new Date().toISOString(),presentation:{framing:'compact',theme:style.theme,background:style.background.asset,border:12},
    evidence:{...await buildEvidence(),checkpoints,snapshots,expected,nativeSessionIds:native,terminalIds:ids,sampleData:true,modelCalls:0,accountsCopied:false,promptsSubmitted:0,loopTransitionMs:800}});
});
