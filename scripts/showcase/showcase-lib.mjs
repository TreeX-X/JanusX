// Showcase v3 composite lib: beige 1080P virtual backdrop + virtual cursor + caption chips.
// Canvas 1920x1080. App card 1760x884 at (80,28). Caption zone y 948..1052.
// Requires warehouse-external gif tools (never npm-install inside repo):
//   npm i --prefix %TEMP%/opencode/giftools --no-save pngjs gifenc
import { createRequire } from 'node:module';
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
export const MISPRINT = style.misprint;

/** Beige studio backdrop: vertical paper gradient, warm/cool radial glows,
 *  faint grid, vignette, caption-zone rules, corner marks, red seal accent. */
export function buildBackdrop() {
  const buf = Buffer.alloc(FW * FH * 4);
  for (let y = 0; y < FH; y++) {
    const t = y / FH;
    for (let x = 0; x < FW; x++) {
      // paper gradient, slightly deeper than pilot beige for 1080P contrast
      let r = style.background.top[0] * (1 - t) + style.background.bottom[0] * t;
      let g = style.background.top[1] * (1 - t) + style.background.bottom[1] * t;
      let b = style.background.top[2] * (1 - t) + style.background.bottom[2] * t;
      // warm glow top-left, cool shade bottom-right, faint cinnabar accent right
      const d1 = Math.hypot(x - 300, y - 60) / 1400;
      const d2 = Math.hypot(x - 1700, y - 1020) / 1300;
      const d3 = Math.hypot(x - 1830, y - 420) / 900;
      const w1 = Math.max(0, 1 - d1);
      const w2 = Math.max(0, 1 - d2);
      const w3 = Math.max(0, 1 - d3);
      if (style.background.glow) {
      r += w1 * w1 * 14 + w3 * w3 * 10;
      g += w1 * w1 * 8 - w2 * w2 * 10 + w3 * w3 * 2;
      b += -w1 * w1 * 8 - w2 * w2 * 16 - w3 * w3 * 6;
      }
      // faint grid inside app zone only
      const inZone = x >= 40 && x < 1880 && y >= 8 && y < 940;
      if (style.background.grid && inZone && (x % 48 === 0 || y % 48 === 0)) {
        const m = Math.hypot(x - 960, y - 470) / 1100;
        const k = Math.max(0, 1 - m) * 0.06;
        r = r * (1 - k) + INK[0] * k;
        g = g * (1 - k) + INK[1] * k;
        b = b * (1 - k) + INK[2] * k;
      }
      // vignette
      const v = Math.min(1, Math.hypot(x - 960, y - 540) / 1150);
      const dk = 1 - v * v * style.background.vignette;
      const i = (y * FW + x) * 4;
      buf[i] = Math.max(0, Math.min(255, r * dk));
      buf[i + 1] = Math.max(0, Math.min(255, g * dk));
      buf[i + 2] = Math.max(0, Math.min(255, b * dk));
      buf[i + 3] = 255;
    }
  }
  const px = (x, y, c) => {
    if (x < 0 || y < 0 || x >= FW || y >= FH) return;
    const i = (y * FW + x) * 4;
    buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
  };
  // caption-zone double rules
  for (let x = 80; x < 1840; x++) {
    px(x, 936, [INK[0], INK[1], INK[2]]);
    if (x % 2 === 0) px(x, 941, [120, 130, 128]);
  }
  // corner registration marks
  const L = 26;
  const corner = (x0, y0, dx, dy) => {
    for (let k = 0; k < L; k++) {
      px(x0 + dx * k, y0, INK); px(x0 + dx * k, y0 + dy, INK);
      px(x0, y0 + dy * k, INK); px(x0 + dx, y0 + dy * k, INK);
    }
  };
  corner(22, 22, 1, 1);
  corner(FW - 23, 22, -1, 1);
  corner(22, FH - 23, 1, -1);
  corner(FW - 23, FH - 23, -1, -1);
  // red seal accent bottom-right of caption zone
  for (let y = 0; y < 44; y++) {
    for (let x = 0; x < 44; x++) {
      const onBorder = x < 3 || y < 3 || x >= 41 || y >= 41;
      const inner = x >= 9 && y >= 9 && x < 35 && y < 35;
      // hollow seal: red frame + red core block
      if (onBorder || inner) px(1840 - 44 + x, 986 + y, RED);
    }
  }
  return buf;
}

/** Card chrome baked once: hard offset shadow + ink border + misprint inner line. */
export function buildCardBase(backdrop) {
  const dst = Buffer.from(backdrop);
  const set = (x, y, c) => {
    if (x < 0 || y < 0 || x >= FW || y >= FH) return;
    const i = (y * FW + x) * 4;
    dst[i] = c[0]; dst[i + 1] = c[1]; dst[i + 2] = c[2];
  };
  // hard shadow
  for (let y = 0; y < AH + 16; y++) {
    for (let x = 0; x < AW + 16; x++) {
      const edge = x < 3 || y < 3 || x >= AW + 13 || y >= AH + 13;
      if (!edge) continue;
      const dx = OX - 3 + x + 11;
      const dy = OY - 3 + y + 13;
      set(dx, dy, [105, 100, 82]);
    }
  }
  // ink border
  for (let x = -3; x < AW + 3; x++) {
    for (const yy of [-3, -2, -1, AH, AH + 1, AH + 2]) set(OX + x, OY + yy, INK);
  }
  for (let y = -3; y < AH + 3; y++) {
    for (const xx of [-3, -2, -1, AW, AW + 1, AW + 2]) set(OX + xx, OY + y, INK);
  }
  // misprint inner line
  for (let x = 0; x < AW; x++) {
    set(OX + x, OY + 3, MISPRINT);
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

/** Standard arrow + red click ring. cx/cy are canvas coords. */
export function drawCursor(dst, cx, cy, click) {
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
  fillPoly(dst, CURSOR.map(t), style.cursor.stroke);
  fillPoly(dst, CURSOR_IN.map(t), style.cursor.fill);
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
