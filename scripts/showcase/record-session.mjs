// Authored sample transcript, real session search, history and continuation gate.
import { expect } from 'playwright/test';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createFixture } from './cli-fixture.mjs';
import { files, buildEvidence } from './blueprint-fixture.mjs';
import { style } from './showcase-config.mjs';
import { prepareRepo, launchApp, skipGate, ensureWorkspace, ensureSidebarExpanded, openWorkspace,
  snapper, saveManifest, runRecord, sleep, AW, AH, git } from './record-lib.mjs';

const captions = Object.fromEntries(['scope','search','turns','detail','confirm','result'].map(key=>[key,{text:key}]));
const prompts=['为任务标题增加本地搜索，保留原有顺序','增加最小字符数判断，并验证空结果'];
const excerpts=['方案：在 src/search.mjs 统一处理大小写，返回匹配任务。','示例记录：至少两个字符才筛选；不足两个字符显示全部任务。'];
const hash=text=>createHash('sha256').update(text).digest('hex');
await runRecord(async ctx=>{
  const fixture=await createFixture(ctx);
  const {recordingRoot,rawDir,repoPath}=await prepareRepo('session',{repoParent:fixture.fixtureRoot,repoName:'Atlas'});ctx.recordingRoot=recordingRoot;
  for(const [path,content]of Object.entries(files)){await mkdir(dirname(join(repoPath,path)),{recursive:true});await writeFile(join(repoPath,path),content);}
  const sourcePath=join(repoPath,'src/search.mjs');
  git(repoPath,'add','-A');git(repoPath,'commit','-m','Prepare Atlas session sample');
  let {application,page}=await launchApp(fixture.fixtureRoot,fixture.claudeConfig,{env:fixture.env});Object.assign(ctx,{application,page});
  await page.evaluate(()=>window.electron.experimental.update({sessions:true}));
  await skipGate(page);await ensureWorkspace(page,'Atlas · 示例会话',repoPath);await ensureSidebarExpanded(page);await openWorkspace(page,'Atlas · 示例会话');
  await page.getByRole('main').getByRole('button',{name:'Claude',exact:true}).click();
  const cliInput=page.locator('.xterm-helper-textarea:visible');
  for(let i=0;i<60;i++) {
    await sleep(700);const text=await page.locator('.xterm-rows:visible').innerText();await cliInput.focus();
    if(/Dark mode|Light mode/.test(text))await cliInput.press('Enter');
    else if(/Is this a project you created|Yes, I trust this folder|Make auto mode your default permission mode/.test(text)){await cliInput.press('ArrowDown');await cliInput.press('Enter');}
    else if(/Detected a custom API key/.test(text)){await cliInput.press('ArrowUp');await cliInput.press('Enter');}
    else if(/Hooks need review|new MCP servers/.test(text))await cliInput.press('Escape');
    else if(/Claude Code v/.test(text)&&/for shortcuts|shift\+tab to cycle/.test(text))break;
    if(i===59)throw new Error('Claude input did not become ready');
  }
  await sleep(1000);
  await expect.poll(async()=> (await page.evaluate(cwd=>window.electron.session.list({cwd}),repoPath)).length,{timeout:60000}).toBeGreaterThan(0);
  const session=(await page.evaluate(cwd=>window.electron.session.list({cwd}),repoPath)).find(s=>s.engine==='claude');expect(session).toBeTruthy();
  await application.close();ctx.application=null;
  const storePath=join(fixture.fixtureRoot,'user-data','janusx','agent-sessions.json');
  const store=JSON.parse(await readFile(storePath,'utf8')),record=store.sessions.find(s=>s.id===session.id);expect(record).toBeTruthy();
  const now=Date.now();record.turns=prompts.map((prompt,i)=>({id:randomUUID(),kind:'done',startedAt:new Date(now-(45-i*30)*60000).toISOString(),endedAt:new Date(now-(43-i*30)*60000).toISOString(),prompt,excerpt:excerpts[i]}));
  // A complete authored native log lets the real transcript parser read both
  // rounds and the UI offer the genuine native-history continuation path.
  const providerSessionId=randomUUID();
  const transcriptDir=join(fixture.claudeConfig,'projects',repoPath.replace(/[^a-zA-Z0-9]/g,'-'));
  const transcriptPath=join(transcriptDir,providerSessionId+'.jsonl');
  await mkdir(transcriptDir,{recursive:true});
  const nativeRows=record.turns.flatMap(turn=>[
    {type:'user',uuid:randomUUID(),sessionId:providerSessionId,cwd:repoPath,timestamp:turn.startedAt,message:{role:'user',content:turn.prompt}},
    {type:'assistant',uuid:randomUUID(),sessionId:providerSessionId,cwd:repoPath,timestamp:turn.endedAt,message:{role:'assistant',content:[{type:'text',text:turn.excerpt}],stop_reason:'end_turn'}},
  ]);
  await writeFile(transcriptPath,nativeRows.map(row=>JSON.stringify(row)).join('\n')+'\n');
  Object.assign(record,{providerSessionId,transcriptPath,turnCount:2,firstPrompt:prompts[0],lastPrompt:prompts[1],status:'done',branch:'main',updatedAt:new Date(now).toISOString()});
  await writeFile(storePath,JSON.stringify(store,null,2));
  ({application,page}=await launchApp(fixture.fixtureRoot,fixture.claudeConfig,{env:fixture.env}));Object.assign(ctx,{application,page});
  const win=await application.browserWindow(page);await win.evaluate((win,size)=>win.setContentSize(size.width,size.height),{width:AW,height:AH});
  await page.evaluate(()=>window.electron.theme.update('dark'));await skipGate(page);await ensureSidebarExpanded(page);await openWorkspace(page,'Atlas · 示例会话');
  await page.getByRole('button',{name:'New Terminal',exact:true}).first().click();
  await page.getByRole('menuitem',{name:'New OpenCode terminal',exact:true}).click();
  await expect.poll(()=>page.locator('.xterm-rows:visible').innerText(),{timeout:90000}).toMatch(/tab agents|ctrl\+p commands/);
  await page.locator('.xterm-helper-textarea:visible').focus();await page.keyboard.insertText('Continue reviewing Atlas search.');
  // Restored terminals get fresh IDs; close their actual tabs before capture.
  const oldTabs=page.locator('main [data-tab-id^="terminal:"]').filter({hasText:/shell|claude/i});
  while(await oldTabs.count()) {
    const count=await oldTabs.count();
    const tab=oldTabs.first();await tab.hover();const b=await tab.locator('[data-tab-close]').boundingBox();
    await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await sleep(1350);await page.mouse.up();await sleep(400);
    await expect(oldTabs).toHaveCount(count-1);
  }
  await expect(page.locator('main [data-tab-id^="terminal:"]')).toHaveCount(1);
  const beforeSource=await readFile(sourcePath,'utf8'),frames=[],points=[];
  const motion=snapper(page,rawDir,frames,null,{motion:4,hover:25,click:8,typing:7,settleMs:170,travelPixelsPerStep:40});
  async function point(stage,delay=200){await motion.rest(stage,delay);points.push({stage,frame:frames.length-1,text:await page.locator('body').innerText(),dialogs:await page.getByRole('dialog').count()});console.log(stage,frames.length-1);}
  await motion.snap({x:AW-80,y:AH-45},false,150,'scope');
  await motion.clickSnap(page.getByRole('button',{name:/打开会话工具/}).first(),'scope');
  await expect(page.getByText(prompts[0],{exact:true}).first()).toBeVisible();await point('scope',160);
  await motion.clickSnap(page.getByRole('button',{name:'全部',exact:true}).first(),'scope');
  await motion.clickSnap(page.getByRole('button',{name:'工作区',exact:true}).first(),'search');
  await motion.typeSnap(page.getByPlaceholder('按标题 / 目录 / 分支 / 模型过滤'),'搜索','search');
  await expect(page.getByText(prompts[0],{exact:true}).first()).toBeVisible();await point('search',170);
  await motion.clickSnap(page.locator(`[data-session-id="${session.id}"]`).getByRole('button',{name:'展开',exact:true}),'turns');
  await expect(page.getByText(prompts[1],{exact:true}).first()).toBeVisible();await point('turns',220);
  await motion.clickSnap(page.getByRole('button',{name:'查看详情',exact:true}).first(),'detail');
  const dialog=page.getByRole('dialog').first();await expect(dialog).toContainText(excerpts[1]);await point('detail',270);
  const posterFrame=frames.length-1;
  await expect(dialog.getByRole('button',{name:'回到原会话',exact:true})).toBeEnabled();
  await motion.clickSnap(dialog.getByRole('button',{name:'在新会话中继续',exact:true}),'confirm');
  const confirm=page.getByRole('button',{name:'恢复对话',exact:true});await expect(confirm).toBeVisible();
  await expect(page.getByText('将在新终端中加载原生会话历史，继续原对话。原会话记录仍可查阅。',{exact:true})).toBeVisible();
  await motion.moveSnap(confirm,'confirm',140);await point('confirm',260);
  await motion.clickSnap(page.getByRole('button',{name:'取消',exact:true}).first(),'result');
  await expect(confirm).toHaveCount(0);await point('result',220);
  const finalSource=await readFile(sourcePath,'utf8');expect(finalSource).toBe(beforeSource);
  const last=frames.at(-1),first=frames[0];for(const opacity of [.8,.6,.4,.2,0])frames.push({...last,delay:80,click:false,opacity,transition:'loop-reset'});for(const opacity of [.2,.4,.6,.8,1])frames.push({...first,delay:80,click:false,opacity,transition:'loop-reset'});
  await saveManifest(recordingRoot,{name:'feature-session',frames,captions,posterFrame,createdAt:new Date().toISOString(),presentation:{framing:'compact',theme:'dark',background:style.background.asset,border:12},
    evidence:{...await buildEvidence(),checkpoints:points,sessionId:session.id,providerSessionId,prompts,excerpts,sampleTranscript:true,sampleNativeTranscript:true,nativeRows,sourceBefore:hash(beforeSource),sourceAfter:hash(finalSource),continuationCancelled:true,modelCalls:0,accountsCopied:false,promptsSubmitted:0,loopTransitionMs:800}});
});
