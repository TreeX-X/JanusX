// Sample two real Chromium playback loops, including the fade reset.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { demos } from './showcase-config.mjs';
import { PNG } from './showcase-lib.mjs';

const feature = process.argv[2];
assert.equal(demos[feature]?.framing, 'compact', 'Choose a compact README feature');
const { dir } = JSON.parse(await readFile(`.cache/showcase/${feature}-latest.json`, 'utf8'));
const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
const { FW: width, FH: height } = manifest.canvas;
const border = manifest.presentation.border;
const asset = resolve('wiki/assets', demos[feature].assetDirectory, `${manifest.name}.gif`);
const assetSha256 = createHash('sha256').update(await readFile(asset)).digest('hex');
const duration = manifest.frames.reduce((sum, frame) => sum + frame.delay, 0);
let elapsed = 0;
const middles = manifest.frames.map(frame => {
  const time = elapsed + frame.delay / 2;
  elapsed += frame.delay;
  return time;
});
const times = [
  { stage: 'start', time: 700 },
  ...manifest.evidence.checkpoints.map(point => ({ stage: `${point.stage}-${point.frame}`, time: middles[point.frame] })),
  { stage: 'fade', time: duration - 400 },
].sort((a, b) => a.time - b.time);
const html = join(dir, 'browser-playback.html');
await writeFile(html, `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#fff}img{display:block;width:${width}px;height:${height}px}</style><img src="${pathToFileURL(asset).href}">`);
const browser = await chromium.launch();
const samples = [];
let borderHash;
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(html).href);
  await page.locator('img').evaluate(image => image.decode());
  const started = Date.now();
  for (let loop = 0; loop < 2; loop++) {
    for (const point of times) {
      const wait = loop * duration + point.time - (Date.now() - started);
      if (wait > 0) await page.waitForTimeout(wait);
      const screenshot = await page.screenshot();
      const png = PNG.sync.read(screenshot);
      const hash = createHash('sha256');
      for (let y = 0; y < height; y++) {
        const row = y * width * 4;
        if (y < border || y >= height - border) hash.update(png.data.subarray(row, row + width * 4));
        else {
          hash.update(png.data.subarray(row, row + border * 4));
          hash.update(png.data.subarray(row + (width - border) * 4, row + width * 4));
        }
      }
      const ring = hash.digest('hex');
      if (borderHash) assert.equal(ring, borderHash, 'The background border must remain fixed');
      else borderHash = ring;
      const name = `browser-loop-${loop + 1}-${point.stage}.png`;
      await writeFile(join(dir, name), screenshot);
      samples.push({ loop: loop + 1, stage: point.stage, time: Date.now() - started,
        frame: createHash('sha256').update(screenshot).digest('hex') });
      console.log(`${feature}: ${name}`);
    }
  }
  assert.ok(new Set(samples.map(sample => sample.frame)).size > 5, 'The GIF must animate');
} finally {
  await browser.close();
}
await writeFile(join(dir, 'browser-verification.json'), JSON.stringify({
  feature, duration, loops: 2, fixedBorder: true, assetSha256, samples,
}, null, 2));
console.log(`${feature}: two playback loops sampled; static borders match.`);
