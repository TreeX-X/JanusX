// Record: Janus Island — slow 4-act tour.
// Act1 capsule / Act2 expand + monitor hold / Act3 switch to chat + hold /
// Act4 back to monitor + hold, collapse, closing still.
import {
  prepareRepo, seedFixture, launchApp, skipGate, ensureWorkspace, ensureSidebarExpanded,
  openWorkspace, newShell, snapper, saveManifest, runRecord, sleep,
} from './record-lib.mjs';

await runRecord(async (ctx) => {
  const { recordingRoot, rawDir, repoPath } = await prepareRepo('island');
  ctx.recordingRoot = recordingRoot;
  const { fixtureRoot, claudeConfig } = await seedFixture();
  ctx.fixtureRoot = fixtureRoot;
  const { application, page } = await launchApp(fixtureRoot, claudeConfig);
  ctx.application = application;
  ctx.page = page;

  await skipGate(page);
  await ensureWorkspace(page, 'demo-isl', repoPath);
  await ensureSidebarExpanded(page);
  await openWorkspace(page, 'demo-isl');
  await newShell(page);

  const frames = [];
  const { box, center, snap, glideTo } = snapper(page, rawDir, frames);
  const island = page.locator('.janus-island').first();
  await island.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  const monitorTab = page.locator('.janus-island .janus-expanded-view-button[data-view="monitor"]');
  const chatTab = page.locator('.janus-island .janus-expanded-view-button[data-view="chat"]');

  // ---- act 1: capsule establishing, 2 stills ----
  await snap(null, false, 140, 'isl-1');
  await sleep(500);
  await snap(null, false, 140, 'isl-1');

  // ---- act 2: glide, hover, expand, monitor hold ----
  const ibox = await box(island).catch(() => null);
  if (!ibox) throw new Error('island capsule not found');
  const c = center(ibox);
  await glideTo(c.x - 260, c.y + 120, c.x, c.y, 8, 'isl-2');
  await sleep(600);
  await snap({ x: c.x, y: c.y }, false, 110, 'isl-2');
  async function ensureExpanded() {
    await island.dblclick();
    await snap({ x: c.x, y: c.y }, true, 40, 'isl-2');
    await sleep(1200);
    // wait for real content, not just the animating shell
    await page.locator('.janus-island').getByText('核心可视化').first()
      .waitFor({ state: 'visible', timeout: 9000 }).catch(() => {});
    await sleep(800);
    return (await chatTab.count()) > 0;
  }
  if (!(await ensureExpanded())) {
    console.log('expand retry...');
    await sleep(800);
    if (!(await ensureExpanded())) throw new Error('island did not expand');
  }
  await snap(null, false, 150, 'isl-2');
  await sleep(600);
  await snap(null, false, 150, 'isl-2');

  // ---- act 3: switch to chat tab, hold ----
  {
    const cb = await box(chatTab.first()).catch(() => null);
    if (!cb) throw new Error('chat tab not found');
    const t = center(cb);
    await glideTo(t.x - 220, t.y + 60, t.x, t.y, 8, 'isl-3');
    await sleep(600);
    await snap({ x: t.x, y: t.y }, false, 110, 'isl-3');
    await chatTab.first().click().catch(() => page.mouse.click(t.x, t.y));
    await snap({ x: t.x, y: t.y }, true, 40, 'isl-3');
    await sleep(1500);
    await snap(null, false, 150, 'isl-3');
    await sleep(600);
    await snap(null, false, 150, 'isl-3');
  }

  // ---- act 4: back to monitor, hold, collapse, closing still ----
  {
    const mb = await box(monitorTab.first()).catch(() => null);
    if (!mb) throw new Error('monitor tab not found');
    const t = center(mb);
    await glideTo(t.x + 220, t.y + 60, t.x, t.y, 8, 'isl-4');
    await sleep(600);
    await snap({ x: t.x, y: t.y }, false, 110, 'isl-4');
    await monitorTab.first().click().catch(() => page.mouse.click(t.x, t.y));
    await snap({ x: t.x, y: t.y }, true, 40, 'isl-4');
    await sleep(1500);
    await snap(null, false, 150, 'isl-4');
    await sleep(600);
    await island.dblclick();
    await sleep(1500);
    await snap(null, false, 200, 'isl-4');
  }

  await saveManifest(recordingRoot, {
    name: 'feature-island', viewport: { width: 1760, height: 884 },
    canvas: { FW: 1920, FH: 1080 }, count: frames.length, frames,
    createdAt: new Date().toISOString(),
  });
});
