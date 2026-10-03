// Real file discovery and previews, using authored local files; no model calls.
import { expect } from '@playwright/test';
import { mkdtemp, writeFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  prepareRepo, launchApp, skipGate, ensureWorkspace, ensureSidebarExpanded,
  openWorkspace, newShell, snapper, saveManifest, runRecord,
} from './record-lib.mjs';

const captions = {
  'product-1': { badge: '1', text: '文件落盘，Island 提醒' },
  'product-2': { badge: '2', text: '点击提醒，打开产物预览' },
  'product-3': { badge: '3', text: 'HTML 预览可直接交互' },
  'product-4': { badge: '4', text: '监控列表打开验收结果' },
  'product-5': { badge: '5', text: '多标签切换，成果并排看' },
  'product-6': { badge: '6', text: '修改文件，从磁盘重新加载' },
};

const report = (updated = false) => `<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<style>
body{margin:0;padding:30px;background:#f6f0df;color:#1c343b;font:17px/1.65 'Microsoft YaHei',sans-serif}
small{color:#a24732;letter-spacing:2px}h1{font-size:30px;line-height:1.3;margin:18px 0}
h2{font-size:20px}hr{border:0;border-top:1px solid #b8baa7;margin:24px 0}
button{background:#1c343b;color:#f6f0df;border:0;padding:12px 18px;cursor:pointer;font:inherit}
strong{font-size:32px}p{margin:12px 0}#detail{border-left:3px solid #c83020;padding-left:16px}
</style><small>DEMO / 项目交付</small><h1>登录流程验收报告</h1>
<p>页面、文档与结果，留在当前工作区。</p><hr>
<strong>${updated ? '8 / 8' : '6 / 6'}</strong><p>${updated ? '新增：会话续期与退出测试通过' : '登录、鉴权与错误提示已检查'}</p>
<button onclick="document.querySelector('#detail').hidden = !document.querySelector('#detail').hidden">查看验收明细</button>
<div id="detail" hidden><h2>验收明细</h2><p>✓ 正常登录<br>✓ 无效凭证提示<br>✓ Token 过期处理</p></div>
<hr><p>${updated ? '第二版 · 文件修改后重新加载' : '第一版 · 本地 HTML 演示文件'}</p></html>`;

await runRecord(async (ctx) => {
  const { recordingRoot, rawDir, repoPath } = await prepareRepo('product');
  ctx.recordingRoot = recordingRoot;
  const resultPath = join(repoPath, '验收结果.json');
  await writeFile(resultPath, JSON.stringify({
    project: '登录模块', status: '通过', passed: 6, failed: 0,
    checks: ['正常登录', '无效凭证', 'Token 过期'],
    source: '本地示例数据',
  }, null, 2));
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'janusx-product-'));
  ctx.fixtureRoot = fixtureRoot;
  const { application, page } = await launchApp(fixtureRoot, fixtureRoot);
  Object.assign(ctx, { application, page });
  await skipGate(page);
  await ensureWorkspace(page, 'demo-product', repoPath);
  await ensureSidebarExpanded(page);
  await openWorkspace(page, 'demo-product');
  await newShell(page);
  const discovery = await page.evaluate(async () => {
    const workspaces = await window.electron.workspace.list();
    const workspace = workspaces.find((entry) => entry.name === 'demo-product');
    return window.electron.office.listFiles({ workspaceId: workspace.id });
  });
  if (!discovery.ok) throw new Error(`Product discovery failed: ${JSON.stringify(discovery)}`);

  const frames = [];
  const { rest, clickSnap, box, center, dragTo } = snapper(page, rawDir, frames);
  const island = page.locator('.janus-island').first();
  const panel = page.locator('.product-panel-enter');
  const tab = (name) => panel.locator('button[aria-selected]').filter({ hasText: name });
  const preview = page.frameLocator('iframe[title="生成文档预览"]');
  // Products are session-scoped: baseline files surface only after modification.
  await appendFile(resultPath, '\n');
  await island.dblclick();
  await expect(page.locator('.janus-office-artifact-list')).toContainText('验收结果.json', { timeout: 15000 });
  await island.dblclick();
  await rest('product-1');
  await writeFile(join(repoPath, '验收报告.html'), report());
  const notice = page.getByRole('button', { name: '打开 验收报告.html 的产物预览', exact: true });
  await expect(notice).toBeVisible({ timeout: 20000 });
  await rest('product-1', 180);
  await clickSnap(notice, 'product-2');
  await expect(preview.getByRole('heading', { name: '登录流程验收报告' })).toBeVisible();
  const separator = page.getByRole('separator', { name: 'Resize product workspace' });
  const handle = center(await box(separator));
  await dragTo(handle.x, handle.y, handle.x - 280, handle.y, 20, 'product-2');
  await rest('product-2', 200);

  await clickSnap(preview.getByRole('button', { name: '查看验收明细' }), 'product-3');
  await expect(preview.getByRole('heading', { name: '验收明细', exact: true })).toBeVisible();
  await rest('product-3', 180);

  await clickSnap(island, 'product-4', { double: true });
  const document = page.locator('.janus-office-artifact-list').getByRole('button', { name: '验收结果.json json', exact: true });
  await expect(document).toBeVisible();
  await rest('product-4');
  await clickSnap(document, 'product-4');
  await expect(panel.locator('pre')).toBeVisible();
  await rest('product-4', 200);

  await clickSnap(tab('验收报告.html'), 'product-5');
  await expect(preview.getByRole('heading', { name: '登录流程验收报告' })).toBeVisible();
  await rest('product-5');
  await clickSnap(tab('验收结果.json'), 'product-5');
  await expect(panel.locator('pre')).toBeVisible();
  await rest('product-5');
  await clickSnap(tab('验收报告.html'), 'product-6');
  await writeFile(join(repoPath, '验收报告.html'), report(true));
  await clickSnap(panel.getByRole('button', { name: '从磁盘重新加载' }), 'product-6');
  await expect(preview.getByText('8 / 8', { exact: true })).toBeVisible();
  await rest('product-6', 240);
  await saveManifest(recordingRoot, {
    name: 'feature-product', captions, frames,
    createdAt: new Date().toISOString(),
  });
});
