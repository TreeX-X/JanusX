// Lossless stills of the real Electron window, including attached native views.
import { expect } from 'playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { AW, AH, sleep, skipGate } from './record-lib.mjs';
import { PNG, buildBackdrop, downscaleBilinear, FW, FH } from './showcase-lib.mjs';

export const stillDir = resolve('wiki/assets/readme/features');
export const digest = data => createHash('sha256').update(data).digest('hex');
const border = 12, width = AW + border * 2, height = AH + border * 2;
const backdrop = downscaleBilinear(buildBackdrop(), FW, FH, width, height);

export async function readyWindow(application, page, theme) {
  const host = await application.browserWindow(page);
  await host.evaluate((win, size) => win.setContentSize(size.width, size.height), { width: AW, height: AH });
  await skipGate(page);
  const learning = page.getByRole('dialog').filter({ hasText: '首次入门' });
  if (await learning.count()) await learning.getByRole('button', { name: '关闭', exact: true }).click();
  await page.evaluate(value => window.electron.theme.update(value), theme);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  return host;
}

export async function captureNative(application, page) {
  const host = await application.browserWindow(page);
  const base = PNG.sync.read(await page.screenshot({ type: 'png' }));
  expect([base.width, base.height]).toEqual([AW, AH]);
  const views = await host.evaluate(async win => {
    const result = [];
    for (const view of win.contentView.children) {
      if (!view.webContents || view.webContents.isDestroyed()) continue;
      const bounds = view.getBounds();
      if (bounds.width <= 0 || bounds.height <= 0) continue;
      result.push({ bounds, url: view.webContents.getURL(), png: (await view.webContents.capturePage()).toPNG().toString('base64') });
    }
    return result;
  });
  for (const { bounds: b, png } of views) {
    const raw = PNG.sync.read(Buffer.from(png, 'base64'));
    const pixels = raw.width === b.width && raw.height === b.height ? raw.data
      : downscaleBilinear(raw.data, raw.width, raw.height, b.width, b.height);
    for (let y = 0; y < b.height; y++) {
      if (b.y + y < 0 || b.y + y >= AH) continue;
      const left = Math.max(0, -b.x), right = Math.min(b.width, AW - b.x);
      if (right > left) pixels.copy(base.data, ((b.y + y) * AW + b.x + left) * 4,
        (y * b.width + left) * 4, (y * b.width + right) * 4);
    }
  }
  return { png: PNG.sync.write(base), nativeViews: views.map(({ png, ...info }) => info) };
}

export function frameStill(raw) {
  const image = PNG.sync.read(raw);
  expect([image.width, image.height]).toEqual([AW, AH]);
  const data = Buffer.from(backdrop);
  for (let y = 0; y < AH; y++) image.data.copy(data, ((y + border) * width + border) * 4, y * AW * 4, (y + 1) * AW * 4);
  return PNG.sync.write({ width, height, data });
}

export async function saveStill(ctx, name, evidence = {}) {
  await ctx.page.mouse.move(AW - 2, AH - 2);
  await sleep(900);
  const shot = await captureNative(ctx.application, ctx.page);
  const rawPath = join(ctx.recordingRoot, name + '-raw.png');
  await writeFile(rawPath, shot.png);
  const image = frameStill(shot.png), file = name + '.png';
  // Keep captures local until the whole group and its assertions succeed.
  await writeFile(join(ctx.recordingRoot, file), image);
  const report = { file, sha256: digest(image), rawPath, rawSha256: digest(shot.png),
    viewport: { width: AW, height: AH }, canvas: { width, height, border },
    theme: await ctx.page.locator('html').getAttribute('data-theme'), nativeViews: shot.nativeViews, ...evidence };
  console.log(`Captured ${file}: ${width}x${height}, ${shot.nativeViews.length} native views`);
  return report;
}

export async function finishStills(ctx, feature, assets, evidence) {
  const images = await Promise.all(assets.map(async asset => {
    const bytes = await readFile(join(ctx.recordingRoot, asset.file));
    expect(digest(bytes)).toBe(asset.sha256);
    return bytes;
  }));
  const report = { schemaVersion: 1, feature, createdAt: new Date().toISOString(), assets,
    accountsCopied: false, modelCalls: 0, promptsSubmitted: 0, ...evidence };
  await writeFile(join(ctx.recordingRoot, 'stills.json'), JSON.stringify(report, null, 2));
  await mkdir(stillDir, { recursive: true });
  for (let i = 0; i < assets.length; i++) await writeFile(join(stillDir, assets[i].file), images[i]);
  await writeFile(resolve('.cache/showcase', feature + '-stills-latest.json'), JSON.stringify({ dir: ctx.recordingRoot }, null, 2));
}

export async function startPi(page, draft) {
  const project = page.locator('[data-pane-region="project"]');
  const oldTabs = await project.locator('[data-tab-id^="terminal:"]').evaluateAll(t => t.map(e => e.dataset.tabId));
  const empty = page.getByRole('main').getByRole('button', { name: 'Pi', exact: true });
  if (await empty.count()) await empty.click();
  else {
    await page.getByRole('button', { name: 'New Terminal', exact: true }).first().click();
    const item = page.getByRole('menuitem', { name: 'New Pi terminal', exact: true });
    await expect(item).toBeVisible(); await sleep(200); await item.click();
  }
  for (const id of oldTabs) {
    const tab = project.locator(`[data-tab-id="${id}"]`);
    await tab.hover();
    const b = await tab.locator('[data-tab-close]').boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down(); await sleep(1350); await page.mouse.up();
    await expect(tab).toHaveCount(0);
  }
  await expect(project.locator('[data-tab-id^="terminal:"]')).toHaveCount(1);
  await expect.poll(() => project.locator('.xterm-rows:visible').innerText(), { timeout: 45000 }).toMatch(/0\.0%\/.*demo/s);
  await project.locator('.xterm-helper-textarea:visible').focus();
  await page.keyboard.insertText(draft);
  await expect.poll(async () => (await project.locator('.xterm-rows:visible').innerText()).replace(/\s/g, '')).toContain(draft.replace(/\s/g, ''));
}

export async function resizeByKeyboard(locator, direction, count) {
  await locator.focus();
  for (let i = 0; i < count; i++) await locator.press(direction);
  await locator.evaluate(el => el.blur());
  await sleep(400);
}
