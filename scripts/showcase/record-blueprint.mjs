import { timing } from './showcase-config.mjs';
const captions = {
  'bp-1': { badge: '1', text: '打开蓝图工作台' },
  'bp-2': { badge: '2', text: '三节点轮切三列联动' },
  'bp-3': { badge: '3', text: '焦点自动带上下文 · 底部动作栏' },
  'bp-4': { badge: '4', text: '逐字写维护指令并发送' },
  'bp-5': { badge: '5', text: '提案确认指引宿主应用' },
};

// Record: blueprint workbench — authored nodes, two node selections
// (three-column linkage + relation tab), Copilot console with node context.
// Zero model calls: the console opens, nothing is ever submitted.
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

// Live maintenance: ONE real model call. The fixture borrows the developer's
// llm-config.json (deleted with the fixture after the run). Default runs stay
// zero-call: type + hover only.
const LIVE = process.env.JANUSX_LIVE_MAINTENANCE === '1';
async function seedLiveConfig(fixtureRoot) {
  const real = join(homedir(), 'AppData', 'Roaming', 'JanusX', 'janusx', 'llm-config.json');
  const dest = join(fixtureRoot, 'user-data', 'janusx', 'llm-config.json');
  await mkdir(join(fixtureRoot, 'user-data', 'janusx'), { recursive: true });
  await writeFile(dest, await readFile(real, 'utf8'));
  console.log('live model config injected (fixture-only)');
}
import {
  prepareRepo, seedFixture, launchApp, skipGate, ensureWorkspace, ensureSidebarExpanded,
  openWorkspace, newShell, snapper, saveManifest, runRecord, sleep, git,
} from './record-lib.mjs';


const DEMO_NOTES = [
  ['终端与分屏', '多终端标签、拖拽分屏、调整面板比例'],
  ['文件对照', '双击嵌入主窗，CLI 与代码左右对照'],
  ['速记', '底部 Markdown 抽屉，编辑分栏预览'],
];

async function authorNotes(repoPath) {
  await mkdir(join(repoPath, '.agents', 'notes'), { recursive: true });
  await writeFile(join(repoPath, '.agents', 'harness.json'), JSON.stringify({
    schemaVersion: 1,
    repoId: randomUUID().toLowerCase(),
    name: 'demo-bp',
  }, null, 2));
  for (const [title, desc] of DEMO_NOTES) {
    const id = randomUUID().toLowerCase();
    await writeFile(join(repoPath, '.agents', 'notes', `2026-09-28-demo-${id.slice(0, 8)}.md`),
      `---\nschema: harness-note/1\nid: ${id}\nkind: decision\nlifecycle: implemented\ncreated: 2026-09-28\nclass: feature\n---\n# ${title}\n\n## Problem\n\n${desc}，缺少顺手的落点。\n\n## Decision\n\n在 JanusX 工作区内就近解决：${desc}。\n\n## Alternatives considered\n\n跳应用处理也能做，但上下文切换成本高。\n\n## Consequences\n\n演示仓库本地条目，仅用于录制展示。\n`);
  }
}

await runRecord(async (ctx) => {
  const { recordingRoot, rawDir, repoPath } = await prepareRepo('blueprint');
  ctx.recordingRoot = recordingRoot;
  // V2 workbench projects the checkout's .agents/notes — author real note files pre-launch
  await authorNotes(repoPath);
  git(repoPath, 'add', '-A');
  git(repoPath, 'commit', '-m', 'demo notes');
  const { fixtureRoot, claudeConfig } = await seedFixture();
  ctx.fixtureRoot = fixtureRoot;
  if (LIVE) await seedLiveConfig(fixtureRoot);
  const { application, page } = await launchApp(fixtureRoot, claudeConfig);
  ctx.application = application;
  ctx.page = page;

  await skipGate(page);
  await ensureWorkspace(page, 'demo-bp', repoPath);
  await ensureSidebarExpanded(page);
  await openWorkspace(page, 'demo-bp');
  await newShell(page);

  const probe = await page.evaluate(async (cwd) => {
    try {
      const rescan = await window.electron.harness.rescan(cwd).catch((e) => ({ error: String(e?.message ?? e) }));
      const list = await window.electron.janus.listBlueprintSummaries(cwd).catch((e) => ({ error: String(e?.message ?? e) }));
      return { rescan, count: Array.isArray(list) ? list.length : list, first: Array.isArray(list) && list[0] ? { id: list[0].id, name: list[0].name, nodes: list[0].nodeCount } : null };
    } catch (e) {
      return { error: String(e?.message ?? e) };
    }
  }, repoPath);
  console.log('probe:', JSON.stringify(probe));

  const frames = [];
  const { box, center, snap, glideTo, rest, clickSnap } = snapper(page, rawDir, frames);
  const hold = rest;
  let px = 880;
  let py = 440;
  const travelClick = clickSnap;

  // ---- bp-1: open workbench, establishing on canvas + three columns ----
  const openBp = page.getByRole('button', { name: /打开蓝图工作台/ });
  await openBp.first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  await travelClick(openBp.first(), 'bp-1');
  await page.locator('.react-flow__node').first().waitFor({ timeout: 15000 }).catch(() => {});
  await sleep(1600);
  await hold('bp-1');
  await hold('bp-1');

  // ---- bp-2: three-node cycle, three-column linkage each time ----
  const titles = ['速记', '终端与分屏', '文件对照'];
  for (const [i, title] of titles.entries()) {
    const node = page.locator('.react-flow__node').filter({ hasText: title }).first();
    if (await node.count()) {
      await travelClick(node, 'bp-2');
      await sleep(1400);
      await hold('bp-2');
    } else {
      console.log('node missing:', title);
    }
    // relation tab rides the first selection: links follow the node
    if (i === 0) {
      const linksTab = page.getByRole('tab', { name: '关系与反链' }).first();
      if (await linksTab.count()) {
        await travelClick(linksTab, 'bp-2');
        await sleep(1200);
        await hold('bp-2');
      }
    }
  }

  // ---- bp-3: canvas focus already carries the batch into the Janus console ----
  // The capsule toggles: it starts OPEN (aria-expanded), so only click when closed.
  const copilot = page.getByRole('button', { name: /打开 Janus Copilot 控制台/ }).first();
  if (await copilot.count()) {
    const expanded = await copilot.getAttribute('aria-expanded').catch(() => null);
    console.log('copilot expanded:', expanded);
    if (expanded !== 'true') {
      await travelClick(copilot, 'bp-3');
      await sleep(1600);
    }
    await hold('bp-3');
  } else {
    console.log('copilot entry missing');
    await hold('bp-3');
  }
  // The read-scope chip is the visible proof that the batch bound itself.
  const scopeChip = page.getByRole('toolbar', { name: '蓝图操作' }).getByText(/读 \d+ 篇/).first();
  if (await scopeChip.count()) {
    const sc0 = center(await box(scopeChip));
    await glideTo(px, py, sc0.x, sc0.y, 10, 'bp-3');
    px = sc0.x;
    py = sc0.y;
    await sleep(700);
    await hold('bp-3');
  } else {
    console.log('scope chip missing');
  }
  // ---- bp-3b: the action bar is the panel's only work surface ----
  const organizeBtn = page.getByRole('button', { name: '整理 Note', exact: true }).first();
  if (await organizeBtn.count()) {
    const ob = center(await box(organizeBtn));
    await glideTo(px, py, ob.x, ob.y, 10, 'bp-3');
    px = ob.x;
    py = ob.y;
    await sleep(700);
    await hold('bp-3');
  } else {
    console.log('action bar missing');
  }
  // attached workspace resources: the dialogue is scoped, not floating
  const scope = page.locator('[aria-label="工作区资源"]').first();
  if (await scope.count()) {
    const sc = center(await box(scope));
    await glideTo(px, py, sc.x, sc.y, 10, 'bp-3');
    px = sc.x;
    py = sc.y;
    await sleep(700);
    await hold('bp-3');
  }
  await hold('bp-3');

  // ---- bp-4: slow-typed maintenance instruction, send hovered never hit ----
  // The composer is a rich editor: pressSequentially per char (press() drops CJK here).
  const composer = page.getByPlaceholder('向 Janus 发送消息或执行命令…').first();
  if (await composer.count()) {
    await composer.click().catch(() => {});
    const cc0 = center(await box(composer));
    await glideTo(px, py, cc0.x, cc0.y, 10, 'bp-4');
    px = cc0.x;
    py = cc0.y;
    await sleep(360);
    await snap({ x: cc0.x, y: cc0.y }, false, 120, 'bp-4');
    for (const ch of '文件对照节点验收项加一条：双击行尾徽标') {
      await composer.pressSequentially(ch, { delay: 0 }).catch(() => {});
      await snap({ x: cc0.x, y: cc0.y }, false, 120, 'bp-4');
    }
    await sleep(900);
    await hold('bp-4');
    const send = page.getByRole('button', { name: '发送消息', exact: true }).first();
    if (await send.count()) {
      const dc = center(await box(send));
      await glideTo(px, py, dc.x, dc.y, 10, 'bp-4');
      px = dc.x;
      py = dc.y;
      await sleep(700);
      await hold('bp-4');
      if (LIVE) {
        // TWO real rounds: instruction -> proposal -> conversational approval
        // ("同意，按提案应用") -> agent applies -> note file + canvas update.
        await send.click().catch(() => page.mouse.click(dc.x, dc.y));
        await snap({ x: dc.x, y: dc.y }, true, timing.click, 'bp-4');
        await sleep(8000);
        await hold('bp-4');
        const proposalSeen = () => page.getByText(/变更提议|变更方案|变更提案/).first().count().catch(() => 0);
        const taskScan = () => page.evaluate(async () => {
          const tasks = await window.electron.janus.listMaintenanceTasks().catch(() => []);
          return (Array.isArray(tasks) ? tasks : []).map((t) => ({ status: t.status, cs: t.changeSet ? t.changeSet.id : null, ops: (t.changeSet?.operations ?? []).length }));
        }).catch(() => null);
        let proposed = false;
        for (let i = 0; i < 36 && !proposed; i++) {
          if (await proposalSeen()) {
            proposed = true;
            break;
          }
          if (i % 3 === 0) console.log('tasks:', JSON.stringify(await taskScan()));
          const err = await page.getByText(/模型.*失败|API.*失败|配置.*模型/).first().count().catch(() => 0);
          if (err) throw new Error('live model call failed; see capture-error.png');
          await sleep(10000);
          await rest('bp-4', 170);
        }
        if (!proposed) throw new Error('proposal never arrived within ~6min');
        console.log('proposal arrived; tasks:', JSON.stringify(await taskScan()));
        await hold('bp-5');
        await hold('bp-5');
        // round 2: approve in dialogue, slowly typed like round 1.
        // Verify the text actually landed (remounted composers eat keystrokes).
        const composer2 = page.getByPlaceholder('向 Janus 发送消息或执行命令…').first();
        const readComposer = async () => {
          const h = await composer2.elementHandle().catch(() => null);
          if (!h) return '';
          return page.evaluate((el) => {
            const v = el.value;
            return typeof v === 'string' && v ? v : (el.textContent || '');
          }, h).catch(() => '');
        };
        const APPROVAL = '同意，按提案应用到蓝图';
        let typed = '';
        for (let attempt = 0; attempt < 3 && !typed.includes('同意'); attempt++) {
          await composer2.click().catch(() => {});
          const cc2 = center(await box(composer2));
          await glideTo(px, py, cc2.x, cc2.y, 10, 'bp-5');
          px = cc2.x;
          py = cc2.y;
          await sleep(360);
          await snap({ x: cc2.x, y: cc2.y }, false, 120, 'bp-5');
          for (const ch of APPROVAL) {
            await composer2.pressSequentially(ch, { delay: 0 }).catch(() => {});
            await snap({ x: cc2.x, y: cc2.y }, false, 120, 'bp-5');
          }
          await sleep(800);
          typed = await readComposer();
          console.log(`round2 typing attempt ${attempt}: ${typed.length} chars`);
        }
        if (!typed.includes('同意')) throw new Error('round-2 text never landed in composer');
        await hold('bp-5');
        const send2 = page.getByRole('button', { name: '发送消息', exact: true }).first();
        const sc2 = center(await box(send2));
        await glideTo(px, py, sc2.x, sc2.y, 10, 'bp-5');
        px = sc2.x;
        py = sc2.y;
        await send2.click().catch(() => page.mouse.click(sc2.x, sc2.y));
        await snap({ x: sc2.x, y: sc2.y }, true, timing.click, 'bp-5');
        await sleep(8000);
        // the user message must echo in chat; otherwise the send missed
        const echoed = await page.getByText('同意，按提案应用到蓝图').first().count().catch(() => 0);
        if (!echoed) throw new Error('round-2 message never echoed in chat');
        // Round 2 ends when the agent settles: no streaming indicator for a
        // full minute after our echo (wording varies run to run — never match
        // on prose). Error notices still fail loudly.
        const BUSY = /思考中|正在输出|正在执行|准备工具|收尾中/;
        const t0 = Date.now();
        let settled = false;
        for (let i = 0; i < 40 && !settled; i++) {
          const err = await page.getByText(/模型.*失败|API.*失败|配置.*模型/).first().count().catch(() => 0);
          if (err) throw new Error('live model call failed; see capture-error.png');
          const busy = await page.getByText(BUSY).first().count().catch(() => 0);
          if (!busy && Date.now() - t0 >= 60000) {
            settled = true;
            break;
          }
          await sleep(10000);
          await rest('bp-5', 170);
        }
        if (!settled) throw new Error('agent never settled within ~7min');
        console.log('round 2 settled');
        await hold('bp-5');
        await hold('bp-5');
      } else {
        await hold('bp-4');
      }
    }
  } else {
    console.log('composer missing');
    await hold('bp-4');
  }

  const nodes = await page.locator('.react-flow__node').count().catch(() => 0);
  console.log('blueprint nodes:', nodes);

  await saveManifest(recordingRoot, {
    captions,
    name: 'feature-blueprint', count: frames.length, frames,
    createdAt: new Date().toISOString(),
  });
});
