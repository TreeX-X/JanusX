// Compose: manifest -> beige 1080P showcase GIF/PNG with virtual cursor + caption chips.
// Usage: node scripts/showcase/compose.mjs [--manifest <session-dir|manifest.json>] [--out terminal-split]
import { chromium } from 'playwright';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { join, resolve, dirname, basename } from 'node:path';
import {
  PNG, assembleGIF, savePNG, buildBackdrop, buildCardBase, pasteAppPixels,
  drawCursor, pasteChip, downscaleBilinear, FW, FH, AW, AH, OX, OY,
} from './showcase-lib.mjs';

const argOf = (name) => {
  const hit = process.argv.find((a) => a.startsWith(name));
  return hit ? hit.slice(name.length) : null;
};
const manifestArg = argOf('--manifest=') ?? resolve('.cache/showcase-split-quad/latest.json');
const outName = argOf('--out=') ?? 'terminal-split';

let manifest;
let sessionDir;
if (manifestArg.endsWith('.json')) {
  const raw = JSON.parse(await readFile(manifestArg, 'utf8'));
  manifest = raw.frames ? raw : JSON.parse(await readFile(join(raw.dir, 'manifest.json'), 'utf8'));
  sessionDir = raw.dir ?? dirname(manifestArg);
} else {
  sessionDir = manifestArg;
  manifest = JSON.parse(await readFile(join(sessionDir, 'manifest.json'), 'utf8'));
}
const rawDir = join(sessionDir, 'frames');
console.log(`Composing ${manifest.frames.length} frames from ${rawDir}`);

// caption chips c1..c5 via Chromium (crisp CJK)
const browser = await chromium.launch();
const capPage = await (await browser.newContext({ viewport: { width: 1000, height: 600 } })).newPage();
await capPage.goto('file:///' + resolve('scripts/showcase/showcase-caption.html').replace(/\\/g, '/'));
const chips = {};
for (const id of [...new Set(manifest.frames.map((f) => f.cap).filter(Boolean))]) {
  chips[id] = PNG.sync.read(await capPage.locator('#' + id).screenshot({ omitBackground: true }));
}
await browser.close();

const BACKDROP = buildBackdrop();
const CARD = buildCardBase(BACKDROP);
const composed = [];
for (const [i, f] of manifest.frames.entries()) {
  const shot = PNG.sync.read(await readFile(join(rawDir, f.file)));
  let data = shot.data;
  if (shot.width !== AW || shot.height !== AH) {
    console.log(`normalize frame ${i}: ${shot.width}x${shot.height} -> ${AW}x${AH}`);
    data = downscaleBilinear(Buffer.from(shot.data), shot.width, shot.height, AW, AH);
  }
  let dst = pasteAppPixels(CARD, Buffer.from(data));
  if (f.mouse) drawCursor(dst, Math.round(f.mouse.x + OX), Math.round(f.mouse.y + OY), f.click);
  if (f.cap && chips[f.cap]) pasteChip(dst, chips[f.cap]);
  composed.push({ dst, delay: f.delay });
}

const gif = assembleGIF(composed, FW, FH);
const { writeFile, rename, rm: rmTmp } = await import('node:fs/promises');
async function writeAsset(name, data) {
  const target = resolve('wiki/assets', name);
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, data);
    await rename(temporary, target);
  } finally {
    await rmTmp(temporary, { force: true }).catch(() => {});
  }
}
await writeAsset(`${outName}.gif`, gif);
// PNG via tmp+rename: Windows refuses direct overwrite of existing images
const pngTarget = resolve(`wiki/assets/${outName}.png`);
await mkdir(dirname(pngTarget), { recursive: true });
const pngTmp = `${pngTarget}.${process.pid}.tmp`;
savePNG(composed[composed.length - 1].dst, pngTmp);
await rename(pngTmp, pngTarget);
console.log(`${outName}: ${composed.length} frames, ${FW}x${FH}, ${(gif.length / 1024 / 1024).toFixed(2)} MB`);
