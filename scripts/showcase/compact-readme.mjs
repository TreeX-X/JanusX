// Reframe existing recordings for README tables; this does not record new UI.
// Optional decoder: npm i --prefix <SHOWCASE_GIFTOOLS> --no-save pngjs gifenc gifuct-js
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { demos } from './showcase-config.mjs';
import {
  PNG, GIFEncoder, quantize, applyPalette, buildBackdrop, downscaleBilinear,
  FW, FH, AW, AH, OX, OY,
} from './showcase-lib.mjs';

const req = createRequire(join(process.env.SHOWCASE_GIFTOOLS ?? join(tmpdir(), 'opencode', 'giftools'), 'package.json'));
const { parseGIF, decompressFrame } = req('gifuct-js');
const output = new URL('../../wiki/assets/readme/features/', import.meta.url);
const source = new URL('../../wiki/assets/showcase/', import.meta.url);
const border = 12;
const width = AW + border * 2;
const height = AH + border * 2;
const backdrop = downscaleBilinear(buildBackdrop(), FW, FH, width, height);
mkdirSync(output, { recursive: true });

function compact(data, sw, sx, sy) {
  const result = Buffer.from(backdrop);
  for (let y = 0; y < AH; y++) {
    const from = ((sy + y) * sw + sx) * 4;
    result.set(data.subarray(from, from + AW * 4), ((border + y) * width + border) * 4);
  }
  return result;
}

function savePng(name, data) {
  writeFileSync(new URL(`${name}.png`, output), PNG.sync.write({ width, height, data }));
}

function* replay(parsed, frames) {
  const canvas = Buffer.alloc(FW * FH * 4);
  for (const raw of frames) {
    const frame = decompressFrame(raw, parsed.gct, true);
    const { left, top, width: pw, height: ph } = frame.dims;
    for (let y = 0; y < ph; y++) {
      for (let x = 0; x < pw; x++) {
        const si = (y * pw + x) * 4;
        if (frame.patch[si + 3] === 0) continue;
        const di = ((top + y) * FW + left + x) * 4;
        canvas[di] = frame.patch[si];
        canvas[di + 1] = frame.patch[si + 1];
        canvas[di + 2] = frame.patch[si + 2];
        canvas[di + 3] = 255;
      }
    }
    yield compact(canvas, FW, OX, OY);
  }
}

for (const name of ['split', 'session', 'worktree', 'product']) {
  // New recordings are composed directly from lossless frames, never old GIFs.
  if (demos[name].framing === 'compact') continue;
  const asset = `feature-${name}`;
  const parsed = parseGIF(readFileSync(new URL(`${asset}.gif`, source)));
  const frames = parsed.frames.filter((frame) => frame.image);
  const first = frames[0]?.image.descriptor;
  // These committed recordings use a full opaque first frame and retain pixels.
  // Reject other formats rather than silently corrupting their compositing.
  if (parsed.lsd.width !== FW || parsed.lsd.height !== FH
    || first?.left !== 0 || first?.top !== 0 || first?.width !== FW || first?.height !== FH
    || frames[0].gce?.extras.transparentColorGiven
    || frames.some((f) => f.gce?.extras.disposal !== 1 || !(f.gce.delay > 0)
      || f.image.descriptor.left + f.image.descriptor.width > FW
      || f.image.descriptor.top + f.image.descriptor.height > FH)) {
    throw new Error(`${asset}: unsupported source layout, disposal or delay`);
  }
  const samples = [];
  const sampled = new Set(Array.from({ length: Math.min(12, frames.length) }, (_, i) =>
    Math.round(i * (frames.length - 1) / Math.max(1, Math.min(12, frames.length) - 1))));
  let index = 0;
  for (const data of replay(parsed, frames)) {
    if (sampled.has(index)) samples.push(downscaleBilinear(data, width, height, 446, 227));
    index++;
  }
  const palette = quantize(Buffer.concat(samples), 255);
  // gifenc caches the first RGB565 match in scan order. Changing app colors can
  // otherwise change later border matches, despite using one global palette.
  const backdropPixels = applyPalette(backdrop, palette);
  const globalPalette = palette.slice();
  while (globalPalette.length < 256) globalPalette.push([0, 0, 0]);
  const gif = GIFEncoder();
  let previous;
  let poster;
  index = 0;
  for (const data of replay(parsed, frames)) {
    const pixels = applyPalette(data, palette);
    for (let y = 0; y < height; y++) {
      const start = y * width;
      if (y < border || y >= height - border) {
        pixels.set(backdropPixels.subarray(start, start + width), start);
      } else {
        pixels.set(backdropPixels.subarray(start, start + border), start);
        const right = start + width - border;
        pixels.set(backdropPixels.subarray(right, right + border), right);
      }
    }
    const opaque = pixels.slice();
    if (previous) {
      for (let p = 0; p < pixels.length; p++) if (pixels[p] === previous[p]) pixels[p] = 255;
    }
    gif.writeFrame(pixels, width, height, {
      palette: index === 0 ? globalPalette : undefined,
      delay: frames[index].gce.delay * 10,
      transparent: index > 0, transparentIndex: 255, dispose: 1, repeat: 0,
    });
    previous = opaque;
    poster = data;
    index++;
  }
  gif.finish();
  const bytes = Buffer.from(gif.bytes());
  writeFileSync(new URL(`${asset}.gif`, output), bytes);
  savePng(asset, poster);
  console.log(`${asset}: ${frames.length} frames, ${width}x${height}, ${frames.reduce((ms, f) => ms + f.gce.delay * 10, 0)}ms, ${(bytes.length / 1024 / 1024).toFixed(2)}MB`);
}

// These images now have real new-UI captures. Never replace them in a normal run.
if (!process.argv.includes('--legacy-stills')) {
  console.log('Skipped legacy stills; use capture-tools.mjs for current README images.');
  process.exit(0);
}
for (const name of ['filetree', 'browser', 'markdown']) {
  const image = PNG.sync.read(readFileSync(new URL(`feature-${name}.png`, source)));
  if (image.width !== FW || image.height !== FH) throw new Error(`feature-${name}: unexpected dimensions`);
  savePng(`feature-${name}`, compact(image.data, FW, OX, OY));
}
const blueprint = PNG.sync.read(readFileSync(new URL('../../wiki/assets/readme/hero-blueprint.png', import.meta.url)));
if (blueprint.width !== AW || blueprint.height !== AH) throw new Error('Blueprint: unexpected dimensions');
savePng('feature-blueprint', compact(blueprint.data, AW, 0, 0));
console.log('Reframed PNGs; original recordings and hero assets preserved.');
