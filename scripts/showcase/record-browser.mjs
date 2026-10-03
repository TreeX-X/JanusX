import { timing } from './showcase-config.mjs';
const captions = {
  'br-1': { badge: '1', text: '点新建浏览器开标签页' },
  'br-2': { badge: '2', text: '地址栏输入回车打开' },
  'br-3': { badge: '3', text: '前后退刷新走历史' },
  'br-4': { badge: '4', text: '多标签并存对照' },
};

// Record: embedded browser — new browser, slow-typed address, two pages,
// back/forward/reload through history, second tab. Offline file:// fixtures.
//
// The web page renders in a WebContentsView: renderer screenshots are blind
// to it, so every frame composites the view capture (matched by active URL)
// onto the placeholder body rect. No product changes; record-side only.
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  prepareRepo, seedFixture, launchApp, skipGate, ensureWorkspace, ensureSidebarExpanded,
  openWorkspace, newShell, snapper, saveManifest, runRecord, sleep,
} from './record-lib.mjs';
import { PNG, downscaleBilinear } from './showcase-lib.mjs';


const PAGE_CSS = 'body{background:#EFE4C5;color:#1C343B;font-family:sans-serif;margin:0;padding:48px}h1{font-size:40px}p{font-size:20px}';

await runRecord(async (ctx) => {
  const { recordingRoot, rawDir, repoPath } = await prepareRepo('browser');
  ctx.recordingRoot = recordingRoot;
  // The view ships a near-black background: fixtures carry their own light style.
  await writeFile(join(repoPath, 'page.html'), `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>demo</title><style>${PAGE_CSS}</style></head><body><h1>JanusX 内置浏览器演示页</h1><p>地址栏直达 · 本地文件离线可开。</p></body></html>\n`);
  await writeFile(join(repoPath, 'page2.html'), `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>demo2</title><style>${PAGE_CSS}</style></head><body><h1>JanusX 内置浏览器演示页（二）</h1><p>前后退与多标签的落点。</p></body></html>\n`);
  const { fixtureRoot, claudeConfig } = await seedFixture();
  ctx.fixtureRoot = fixtureRoot;
  const { application, page } = await launchApp(fixtureRoot, claudeConfig);
  ctx.application = application;
  ctx.page = page;

  await skipGate(page);
  await ensureWorkspace(page, 'demo-br', repoPath);
  await ensureSidebarExpanded(page);
  await openWorkspace(page, 'demo-br');
  await newShell(page);

  // Renderer shot + active view capture pasted onto the surface body rect.
  const shot = async (pg) => {
    const base = await pg.screenshot({ type: 'png' });
    const info = await pg.evaluate(() => {
      const addr = document.querySelector('input[aria-label="地址栏"]');
      // The view overlays the surface body: walk up from the address input,
      // the body is the large sibling of one of its ancestors.
      let body = null;
      let el = addr && addr.parentElement;
      for (let d = 0; d < 7 && el && !body; d++) {
        const parent = el.parentElement;
        if (parent) {
          for (const sib of parent.children) {
            if (sib === el) continue;
            const b = sib.getBoundingClientRect();
            if (b.width > 700 && b.height > 300) {
              body = { x: b.x, y: b.y, w: b.width, h: b.height };
              break;
            }
          }
        }
        el = parent;
      }
      return { url: (addr && addr.value) || '', body };
    }).catch(() => null);
    if (!info || !info.url || !info.body) {
      if (process.env.BROWSER_DEBUG) console.log('shot skip:', JSON.stringify({ url: info && info.url, body: info && info.body }));
      return base;
    }
    const b64 = await application.evaluate(async (E, target) => {
      const norm = (u) => (u || '').trim().replace(/\\/g, '/').toLowerCase();
      const all = E.webContents.getAllWebContents();
      const hit = all.find((w) => !w.isDestroyed() && norm(w.getURL()) === norm(target));
      if (!hit) return null;
      const img = await hit.capturePage();
      return img.toPNG().toString('base64');
    }, info.url).catch(() => null);
    if (!b64 || typeof b64 !== 'string') return base;
    const app = PNG.sync.read(base);
    const view = PNG.sync.read(Buffer.from(b64, 'base64'));
    const bx = Math.round(info.body.x);
    const by = Math.round(info.body.y);
    const bw = Math.round(info.body.w);
    const bh = Math.round(info.body.h);
    const fit = (view.width === bw && view.height === bh)
      ? Buffer.from(view.data)
      : downscaleBilinear(Buffer.from(view.data), view.width, view.height, bw, bh);
    for (let y = 0; y < bh; y++) {
      const dRow = ((by + y) * app.width + bx) * 4;
      const sRow = y * bw * 4;
      if (by + y < 0 || by + y >= app.height) continue;
      fit.copy(app.data, dRow, sRow, sRow + Math.min(bw, app.width - bx) * 4);
    }
    return PNG.sync.write(app);
  };

  const frames = [];
  const { typeSnap, rest, clickSnap } = snapper(page, rawDir, frames, shot);
  const hold = rest;
  const travelClick = clickSnap;
  const urlFor = (f) => 'file:///' + join(repoPath, f).replace(/\\/g, '/');
  const goUrl = async (file, cap) => {
    const address = page.getByRole('textbox', { name: '地址栏' }).first();
    await address.waitFor({ state: 'visible', timeout: 10000 });
    await travelClick(address, cap);
    await address.fill('');
    await typeSnap(address, urlFor(file), cap, { delay: timing.typing, lead: timing.hover });
    await sleep(800);
    await hold(cap);
    await address.press('Enter').catch(() => {});
    await sleep(2500);
    await hold(cap);
  };

  // ---- br-1: open a browser surface ----
  const newBrowser = page.getByRole('button', { name: '新建浏览器' });
  await newBrowser.first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  await travelClick(newBrowser.first(), 'br-1');
  await sleep(1500);
  await hold('br-1');

  // ---- br-2: address opens the first demo page ----
  await goUrl('page.html', 'br-2');

  // ---- br-3: second page, then back / forward / reload through history ----
  await goUrl('page2.html', 'br-3');
  const back = page.getByRole('button', { name: '后退', exact: true }).first();
  if (await back.count()) {
    await travelClick(back, 'br-3');
    await sleep(1800);
    await hold('br-3');
  }
  const fwd = page.getByRole('button', { name: '前进', exact: true }).first();
  if (await fwd.count()) {
    await travelClick(fwd, 'br-3');
    await sleep(1800);
    await hold('br-3');
  }
  const reload = page.getByRole('button', { name: '刷新', exact: true }).first();
  if (await reload.count()) {
    await travelClick(reload, 'br-3');
    await sleep(1800);
    await hold('br-3');
  }

  // ---- br-4: second tab, both pages side by side in the strip ----
  const newTab = page.getByRole('button', { name: '新建标签页' });
  if (await newTab.count()) {
    await travelClick(newTab.first(), 'br-4');
    await sleep(1200);
    await goUrl('page.html', 'br-4');
    await hold('br-4');
  } else {
    await hold('br-4');
  }

  const tabs = await page.locator('main [role="button"][draggable="true"]').count().catch(() => 0);
  console.log('pane tabs:', tabs);

  await saveManifest(recordingRoot, {
    captions,
    name: 'feature-browser', count: frames.length, frames,
    createdAt: new Date().toISOString(),
  });
});
