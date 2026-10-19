// Real worktree creation and branch diff; the main checkout keeps its service.
import { expect } from 'playwright/test';
import { createServer } from 'node:net';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { dirname,join } from 'node:path';
import { createFixture } from './cli-fixture.mjs';
import { files,buildEvidence } from './blueprint-fixture.mjs';
import { style } from './showcase-config.mjs';
import { prepareRepo,launchApp,skipGate,ensureWorkspace,ensureSidebarExpanded,openWorkspace,
  snapper,saveManifest,runRecord,sleep,AW,AH,git } from './record-lib.mjs';

const captions=Object.fromEntries(['main','create','branch','changes','return'].map(key=>[key,{text:key}]));
async function freePort(){const s=createServer();await new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));const port=s.address().port;await new Promise(resolve=>s.close(resolve));return port;}
await runRecord(async ctx=>{
  const fixture=await createFixture(ctx),{recordingRoot,rawDir,repoPath}=await prepareRepo('worktree',{origin:true,repoParent:fixture.fixtureRoot,repoName:'Atlas'});ctx.recordingRoot=recordingRoot;
  for(const [path,content]of Object.entries(files)){await mkdir(dirname(join(repoPath,path)),{recursive:true});await writeFile(join(repoPath,path),content);}
  const port=await freePort();
  await writeFile(join(repoPath,'src/server.mjs'),"import {createServer} from 'node:http';\ncreateServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({project:'Atlas',branch:'main',status:'running'}));}).listen(Number(process.env.PORT),'127.0.0.1',()=>console.log('Atlas main is running'));\n");
  git(repoPath,'add','-A');git(repoPath,'commit','-m','Prepare Atlas worktree demo');git(repoPath,'push','origin','main');
  const {application,page}=await launchApp(fixture.fixtureRoot,fixture.claudeConfig,{env:fixture.env});Object.assign(ctx,{application,page});
  const win=await application.browserWindow(page);await win.evaluate((win,size)=>win.setContentSize(size.width,size.height),{width:AW,height:AH});
  await skipGate(page);await ensureWorkspace(page,'Atlas',repoPath);await ensureSidebarExpanded(page);await openWorkspace(page,'Atlas');
  await page.evaluate(async p=>{
    const written=await window.electron.project.writeConfig(p.path,{version:'0.1.0',projectType:'custom',projectName:'Atlas',configurations:[{name:'dev · main',type:'custom',request:'launch',program:p.node,args:['src/server.mjs'],port:p.port,env:{PORT:String(p.port)}}]});
    if(!written.success)throw new Error(written.error);
    const running=await window.electron.project.run(p.path,'dev · main');if(!running.success)throw new Error(running.error);
  },{path:repoPath,port,node:process.execPath});
  const url=`http://127.0.0.1:${port}`;await expect.poll(async()=>{try{return(await fetch(url)).ok;}catch{return false;}}).toBe(true);
  await page.getByRole('main').getByRole('button',{name:'OpenCode',exact:true}).click();
  await expect.poll(()=>page.locator('.xterm-rows:visible').innerText(),{timeout:90000}).toMatch(/tab agents|ctrl\+p commands/);
  await page.locator('.xterm-helper-textarea:visible').focus();await page.keyboard.insertText('Keep main ready for preview.');
  const mainTabId=await page.locator('main [data-tab-id][data-active="true"]').getAttribute('data-tab-id');
  const sidebar=page.locator('.workspace-sidebar'),ws=sidebar.locator('div.ws').filter({hasText:'Atlas'}).first();
  const rows=sidebar.locator('div[role="button"]').filter({has:page.locator('svg.lucide-git-branch')});
  const mainRow=rows.and(page.locator('[aria-label]').filter({hasText:/main/})).first();
  expect(await mainRow.getAttribute('aria-label')).toBe(repoPath);
  const frames=[],checkpoints=[];const motion=snapper(page,rawDir,frames,null,{motion:4,hover:25,click:8,typing:6,settleMs:170,travelPixelsPerStep:40});
  async function point(stage,delay=190){await motion.rest(stage,delay);checkpoints.push({stage,frame:frames.length-1,text:await page.locator('body').innerText(),service:await(await fetch(url)).json()});console.log(stage,frames.length-1);}
  await motion.snap({x:AW-80,y:AH-45},false,170,'main');
  await ws.hover();await motion.clickSnap(ws.getByRole('button',{name:'更多操作',exact:true}),'main');
  await motion.clickSnap(page.getByRole('button',{name:'运行配置…',exact:true}),'main');
  await expect(page.getByRole('dialog')).toContainText('1 个进程运行中');await point('main',220);
  await motion.clickSnap(page.getByRole('dialog').getByRole('button',{name:/关闭|Close/}).first(),'create');
  await ws.hover();await motion.clickSnap(ws.getByRole('button',{name:'更多操作',exact:true}),'create');
  await motion.clickSnap(page.getByRole('button',{name:'新建任务盘…',exact:true}),'create');
  const dialog=page.getByRole('dialog',{name:'新建任务盘',exact:true});
  await motion.typeSnap(dialog.locator('input').nth(0),'search','create');
  await dialog.locator('input').nth(1).fill('');await motion.typeSnap(dialog.locator('input').nth(1),'feature/search','create');
  await expect(dialog.locator('input').nth(2)).toHaveValue('origin/main');
  await point('create',180);await motion.clickSnap(dialog.getByRole('button',{name:'创建',exact:true}),'create');
  const row=rows.filter({hasText:'feature/search'}).first();await expect(row).toBeVisible({timeout:60000});
  const wtPath=await row.getAttribute('aria-label');expect(wtPath).toBeTruthy();
  await motion.clickSnap(row,'branch');
  await page.getByRole('button',{name:'New Terminal',exact:true}).first().click();
  await page.getByRole('menuitem',{name:'New OpenCode terminal',exact:true}).click();
  await expect.poll(()=>page.locator('.xterm-rows:visible').innerText(),{timeout:90000}).toMatch(/tab agents|ctrl\+p commands/);
  await page.locator('.xterm-helper-textarea:visible').focus();await page.keyboard.insertText('Add a hint for short search queries.');
  await point('branch',220);
  const modified=files['src/search.mjs']+"\nexport function searchHint(query) {\n  return query.trim().length < 2 ? 'Type at least two characters' : '';\n}\n";
  await writeFile(join(wtPath,'src/search.mjs'),modified);git(wtPath,'add','src/search.mjs');git(wtPath,'commit','-m','feat: add short search hint');
  await row.hover();await motion.clickSnap(row.getByRole('button',{name:'合并',exact:true}),'changes');
  await expect(page.getByText('src/search.mjs',{exact:false}).first()).toBeVisible();await point('changes',280);
  const branchDiff=await page.evaluate(path=>window.electron.worktree.shipDiff(path,'origin/main','feature/search'),repoPath);
  await motion.clickSnap(page.getByRole('button',{name:'取消',exact:true}).first(),'return');
  await motion.clickSnap(mainRow,'return');
  await motion.clickSnap(page.locator('main [data-tab-id]').filter({hasText:'opencode'}).and(page.locator(`[data-tab-id="${mainTabId}"]`)),'return');
  await expect(page.locator('.xterm-rows:visible')).toContainText('Keep main ready for preview.');
  expect(await readFile(join(repoPath,'src/search.mjs'),'utf8')).toBe(files['src/search.mjs']);
  expect(await readFile(join(wtPath,'src/search.mjs'),'utf8')).toBe(modified);
  expect(git(repoPath,'branch','--show-current').trim()).toBe('main');expect(git(wtPath,'branch','--show-current').trim()).toBe('feature/search');
  const running=await page.evaluate(()=>window.electron.project.list());expect(running.data).toHaveLength(1);
  await point('return',280);const posterFrame=frames.length-1;
  const service=await(await fetch(url)).json();expect(service.branch).toBe('main');
  for(const p of running.data)await page.evaluate(id=>window.electron.project.stop(id),p.id);
  const last=frames.at(-1),first=frames[0];for(const opacity of [.8,.6,.4,.2,0])frames.push({...last,delay:80,click:false,opacity,transition:'loop-reset'});for(const opacity of [.2,.4,.6,.8,1])frames.push({...first,delay:80,click:false,opacity,transition:'loop-reset'});
  await saveManifest(recordingRoot,{name:'feature-worktree',frames,captions,posterFrame,createdAt:new Date().toISOString(),presentation:{framing:'compact',theme:style.theme,background:style.background.asset,border:12},
    evidence:{...await buildEvidence(),checkpoints,mainBranch:'main',worktreeBranch:'feature/search',branchDiff,mainSource:files['src/search.mjs'],worktreeSource:modified,service,mainServiceRetained:true,merged:false,modelCalls:0,promptsSubmitted:0,accountsCopied:false,loopTransitionMs:800}});
});
