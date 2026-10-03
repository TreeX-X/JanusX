// Compose one manifest; recording owns captions, shared config owns presentation.
import { chromium } from 'playwright';
import { readFile, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { join, resolve, dirname, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { demos, style } from './showcase-config.mjs';
import {
  PNG, GIFEncoder, quantize, applyPalette, buildBackdrop, buildCardBase, pasteAppPixels,
  drawCursor, pasteChip, downscaleBilinear, FW, FH, AW, AH, OX, OY,
} from './showcase-lib.mjs';

function options(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    const [key, inline] = args[i].split(/=(.*)/s);
    if (!['--feature', '--manifest', '--out', '--tempo'].includes(key)) throw new Error(`Unknown option: ${key}`);
    const value = inline ?? args[++i];
    if (!value || value.startsWith('--')) throw new Error(`Missing value: ${key}`);
    result[key.slice(2)] = value;
  }
  return result;
}
const args = options(process.argv.slice(2));
if (args.feature && !demos[args.feature]) throw new Error(`Unknown feature: ${args.feature}`);
if (!args.feature && !args.manifest) throw new Error('Use --feature product or --manifest <session-dir|manifest.json>');
const tempo = Number(args.tempo ?? 1);
if (!Number.isFinite(tempo) || tempo <= 0) throw new Error('--tempo must be a positive delay multiplier');
const manifestArg = resolve(args.manifest ?? `.cache/showcase/${args.feature}-latest.json`);
let sessionDir = manifestArg.endsWith('.json') ? dirname(manifestArg) : manifestArg;
let manifest = JSON.parse(await readFile(manifestArg.endsWith('.json') ? manifestArg : join(sessionDir, 'manifest.json'), 'utf8'));
if (!manifest.frames && manifest.dir) {
  sessionDir = resolve(manifest.dir);
  manifest = JSON.parse(await readFile(join(sessionDir, 'manifest.json'), 'utf8'));
}
if (!manifest.frames?.length) throw new Error('Manifest has no frames');
if (!manifest.captions) throw new Error('Manifest predates per-feature captions; re-record this feature with run.mjs record');
if (args.feature && manifest.feature !== args.feature) throw new Error('Manifest feature does not match --feature');
const outName = args.out ?? `showcase/${demos[manifest.feature]?.asset ?? manifest.name}`;
const assetRoot = resolve('wiki/assets');
const target = resolve(assetRoot, outName);
const targetRelative = relative(assetRoot, target);
if (!targetRelative || targetRelative.startsWith('..') || isAbsolute(targetRelative)) throw new Error('--out must stay inside wiki/assets');
for (const frame of manifest.frames) {
  if (!Number.isFinite(frame.delay) || frame.delay <= 0) throw new Error('Invalid frame delay');
  if (frame.cap && !manifest.captions[frame.cap]) throw new Error(`Missing caption: ${frame.cap}`);
}
console.log(`Composing ${manifest.frames.length} frames from ${sessionDir}`);

const chips = {};
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1760, height: 200 } });
  await page.goto(pathToFileURL(resolve('scripts/showcase/showcase-caption.html')).href);
  const rgb = (color) => `rgb(${color.join(',')})`;
  await page.addStyleTag({ content: `.chip{background:${rgb(style.ink)};border-color:${rgb(style.ink)}}.chip .n{background:${rgb(style.accent)}}` });
  await page.evaluate(() => document.fonts.ready);
  for (const id of new Set(manifest.frames.map((f) => f.cap).filter(Boolean))) {
    await page.locator('#caption .n').evaluate((el, text) => { el.textContent = text; }, manifest.captions[id].badge);
    await page.locator('#caption .text').evaluate((el, text) => { el.textContent = text; }, manifest.captions[id].text);
    chips[id] = PNG.sync.read(await page.locator('#caption').screenshot({ omitBackground: true }));
  }
} finally {
  await browser.close();
}

const card = buildCardBase(buildBackdrop());
async function composeFrame(frame) {
  const shot = PNG.sync.read(await readFile(join(sessionDir, 'frames', frame.file)));
  const data = shot.width === AW && shot.height === AH ? shot.data
    : downscaleBilinear(shot.data, shot.width, shot.height, AW, AH);
  const dst = pasteAppPixels(card, data);
  if (frame.mouse) drawCursor(dst, Math.round(frame.mouse.x * AW / shot.width + OX), Math.round(frame.mouse.y * AH / shot.height + OY), frame.click);
  if (frame.cap) pasteChip(dst, chips[frame.cap]);
  return dst;
}

// Sample across the timeline, then encode one frame at a time; avoid retaining
// hundreds of uncompressed 1080p buffers for long recordings.
const sampleCount = Math.min(12, manifest.frames.length);
const samples = [];
for (let i = 0; i < sampleCount; i++) {
  const index = Math.round(i * (manifest.frames.length - 1) / Math.max(1, sampleCount - 1));
  samples.push(downscaleBilinear(await composeFrame(manifest.frames[index]), FW, FH, 480, 270));
}
const palette = quantize(Buffer.concat(samples), 255);
const gifPalette = palette.slice();
while (gifPalette.length < 256) gifPalette.push([0, 0, 0]);
const gif = GIFEncoder();
let previous = null;
let poster;
for (const [i, frame] of manifest.frames.entries()) {
  const dst = await composeFrame(frame);
  const pixels = applyPalette(dst, palette);
  const opaque = pixels.slice();
  if (previous) for (let p = 0; p < pixels.length; p++) if (pixels[p] === previous[p]) pixels[p] = 255;
  gif.writeFrame(pixels, FW, FH, {
    palette: i === 0 ? gifPalette : undefined,
    delay: Math.max(10, Math.round(frame.delay * tempo)),
    transparent: i > 0, transparentIndex: 255, dispose: 1, repeat: 0,
  });
  previous = opaque;
  poster = dst;
  if (i % 50 === 0) console.log(`Encoded ${i + 1}/${manifest.frames.length}`);
}
gif.finish();

async function writeAsset(extension, data) {
  const path = `${target}.${extension}`;
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, data);
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
const bytes = Buffer.from(gif.bytes());
await writeAsset('gif', bytes);
await writeAsset('png', PNG.sync.write({ width: FW, height: FH, data: poster }));
console.log(`${outName}: ${manifest.frames.length} frames, ${FW}×${FH}, ${(bytes.length / 1024 / 1024).toFixed(2)} MB`);
