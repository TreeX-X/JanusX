// Showcase v3 composite lib: shared 1080P wallpaper + virtual cursor + caption chips.
// Canvas 1920x1080. App card 1760x884 at (80,28). Caption zone y 948..1052.
// Requires warehouse-external gif tools (never npm-install inside repo):
//   npm i --prefix %TEMP%/opencode/giftools --no-save pngjs gifenc
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { layout, style } from './showcase-config.mjs';

const req = createRequire(join(process.env.SHOWCASE_GIFTOOLS ?? join(tmpdir(), 'opencode', 'giftools'), 'package.json'));
export const { PNG } = req('pngjs');
export const gifenc = req('gifenc');
export const { GIFEncoder, quantize, applyPalette } = gifenc;

export const FW = layout.width;
export const FH = layout.height;
export const AW = layout.appWidth;
export const AH = layout.appHeight;
export const OX = layout.appX;
export const OY = layout.appY;
export const CAP_X = layout.captionX;
export const CAP_Y = layout.captionY;

export const INK = style.ink;
export const RED = style.accent;

/** The hero and every frame use the same opaque, pre-rendered background. */
export function buildBackdrop() {
  const image = PNG.sync.read(readFileSync(new URL(`../../${style.background.asset}`, import.meta.url)));
  if (image.width !== FW || image.height !== FH) {
    throw new Error(`Showcase background must be ${FW}×${FH}; run node wiki/assets/readme/render-hero.cjs`);
  }
  return Buffer.from(image.data);
}

/** Quiet frame: a soft shadow and a one-pixel border, baked once. */
export function buildCardBase(backdrop) {
  const dst = Buffer.from(backdrop);
  for (let y = Math.max(0, OY - 24); y < Math.min(FH, OY + AH + 56); y++) {
    for (let x = Math.max(0, OX - 40); x < Math.min(FW, OX + AW + 40); x++) {
      if (x >= OX && x < OX + AW && y >= OY && y < OY + AH) continue;
      const dx = Math.max(OX - x, 0, x - (OX + AW - 1));
      const dy = Math.max(OY + 12 - y, 0, y - (OY + AH + 11));
      let alpha = 0.12 * Math.exp(-(dx * dx + dy * dy) / 450);
      if (x >= OX - 1 && x <= OX + AW && y >= OY - 1 && y <= OY + AH) alpha = 0.22;
      const i = (y * FW + x) * 4;
      for (let c = 0; c < 3; c++) dst[i + c] = Math.round(dst[i + c] * (1 - alpha) + INK[c] * alpha);
    }
  }
  return dst;
}

/** Paste app pixels 1:1 into the card. app must be AW*AH*4 RGBA. */
export function pasteAppPixels(cardBase, app) {
  const dst = Buffer.from(cardBase);
  for (let y = 0; y < AH; y++) {
    const sRow = y * AW * 4;
    const dRow = ((OY + y) * FW + OX) * 4;
    app.copy(dst, dRow, sRow, sRow + AW * 4);
  }
  return dst;
}

function fillPoly(dst, pts, color) {
  let minY = FH;
  let maxY = 0;
  for (const p of pts) {
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
  }
  const n = pts.length;
  for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(FH - 1, Math.ceil(maxY)); y++) {
    const xs = [];
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const bb = pts[(i + 1) % n];
      if ((a[1] <= y && bb[1] > y) || (bb[1] <= y && a[1] > y)) {
        xs.push(a[0] + ((y - a[1]) / (bb[1] - a[1])) * (bb[0] - a[0]));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.max(0, Math.ceil(xs[k])); x <= Math.min(FW - 1, Math.floor(xs[k + 1])); x++) {
        const i = (y * FW + x) * 4;
        dst[i] = color[0]; dst[i + 1] = color[1]; dst[i + 2] = color[2];
      }
    }
  }
}

// Standard demo arrow, ~1.3x pilot size for 1080P legibility.
const S = style.cursor.scale;
const CURSOR = [[0, 0], [0, 27], [7, 21], [11, 29], [14, 27], [10, 19], [18, 19]].map(([x, y]) => [x * S, y * S]);
const CURSOR_IN = [[2.5, 4], [2.5, 22], [8, 17.5], [11, 24], [12.5, 23], [9.5, 16.5], [14.5, 16.5]].map(([x, y]) => [x * S, y * S]);

/** Standard arrow, restrained held state, and a ring only for actual clicks. */
export function drawCursor(dst, cx, cy, click, pressed = false) {
  if (click) {
    for (let a = 0; a < 360; a += 2) {
      for (let w = -1; w <= 1; w++) {
        const x = Math.round(cx + 12 + Math.cos((a * Math.PI) / 180) * style.cursor.ringRadius + w);
        const y = Math.round(cy + 16 + Math.sin((a * Math.PI) / 180) * style.cursor.ringRadius + w);
        if (x < 0 || y < 0 || x >= FW || y >= FH) continue;
        const i = (y * FW + x) * 4;
        dst[i] = RED[0]; dst[i + 1] = RED[1]; dst[i + 2] = RED[2];
      }
    }
  }
  const t = (p) => [p[0] + cx, p[1] + cy];
  fillPoly(dst, CURSOR.map(t), pressed ? style.cursor.fill : style.cursor.stroke);
  fillPoly(dst, CURSOR_IN.map(t), pressed ? style.cursor.stroke : style.cursor.fill);
}

/** Caption chips live in the clean bottom zone, never covering the app. */
export function pasteChip(dst, chip) {
  for (let y = 0; y < chip.height; y++) {
    for (let x = 0; x < chip.width; x++) {
      const si = (y * chip.width + x) * 4;
      if (chip.data[si + 3] < 128) continue;
      const dx = CAP_X + x;
      const dy = CAP_Y + y;
      if (dx < 0 || dy < 0 || dx >= FW || dy >= FH) continue;
      const di = (dy * FW + dx) * 4;
      const a = chip.data[si + 3] / 255;
      dst[di] = dst[di] * (1 - a) + chip.data[si] * a;
      dst[di + 1] = dst[di + 1] * (1 - a) + chip.data[si + 1] * a;
      dst[di + 2] = dst[di + 2] * (1 - a) + chip.data[si + 2] * a;
    }
  }
}

/** Bilinear downscale: keeps CJK text sharp when normalizing odd-size shots. */
export function downscaleBilinear(src, sw, sh, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4);
  const xr = sw / dw;
  const yr = sh / dh;
  for (let y = 0; y < dh; y++) {
    const sy = (y + 0.5) * yr - 0.5;
    const y0 = Math.max(0, Math.floor(sy));
    const y1 = Math.min(sh - 1, y0 + 1);
    const fy = Math.min(1, Math.max(0, sy - y0));
    for (let x = 0; x < dw; x++) {
      const sx = (x + 0.5) * xr - 0.5;
      const x0 = Math.max(0, Math.floor(sx));
      const x1 = Math.min(sw - 1, x0 + 1);
      const fx = Math.min(1, Math.max(0, sx - x0));
      const di = (y * dw + x) * 4;
      for (let c = 0; c < 4; c++) {
        const a = src[(y0 * sw + x0) * 4 + c];
        const b2 = src[(y0 * sw + x1) * 4 + c];
        const cc = src[(y1 * sw + x0) * 4 + c];
        const d = src[(y1 * sw + x1) * 4 + c];
        out[di + c] = Math.round(a * (1 - fx) * (1 - fy) + b2 * fx * (1 - fy) + cc * (1 - fx) * fy + d * fx * fy);
      }
    }
  }
  return out;
}
