import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { snapper } from '../../scripts/showcase/record-motion.mjs';
import { createPaletteMapper } from '../../scripts/showcase/palette.mjs';

test('close UI colors in one RGB565 bucket retain their own palette entries across frames', () => {
  const map = createPaletteMapper([[232, 228, 192], [239, 228, 197]]);
  const dark = [232, 228, 192, 255], light = [239, 228, 197, 255];
  assert.deepEqual([...map(Uint8Array.from([...dark, ...light]))], [0, 1]);
  assert.deepEqual([...map(Uint8Array.from([...light, ...dark]))], [1, 0]);
});

test('palette mapping respects pixel buffer slices and selects the nearest RGB color', () => {
  const map = createPaletteMapper([[0, 0, 0], [255, 255, 255], [212, 61, 42]]);
  const pixels = Buffer.from([0, 0, 0, 255, 210, 60, 43, 255, 253, 254, 255, 255, 0, 0, 0, 255]);
  assert.deepEqual([...map(pixels.subarray(4, 12))], [2, 1]);
});

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'janusx-motion-test-'));
  t.after(async () => {
    assert.equal(dirname(resolve(dir)), resolve(tmpdir()));
    assert.ok(basename(dir).startsWith('janusx-motion-test-'));
    await rm(dir, { recursive: true, force: true });
  });
  const events = [];
  const page = {
    mouse: {
      move: async (x, y) => { events.push(['move', x, y]); },
      down: async () => { events.push(['down']); },
      up: async () => { events.push(['up']); },
    },
    keyboard: { insertText: async (text) => { events.push(['text', text]); } },
    screenshot: async () => Buffer.from('test-frame'),
  };
  const frames = [];
  const motion = snapper(page, dir, frames, null, { settleMs: 0 });
  return { motion, frames, events, page, dir };
}

test('holds preserve the cursor and GIF delays are milliseconds', async (t) => {
  const { motion, frames } = await fixture(t);
  await motion.snap({ x: 42, y: 90 }, true, 12, 'step');
  await motion.rest('step', 120);
  assert.deepEqual(frames.map((f) => f.mouse), [{ x: 42, y: 90 }, { x: 42, y: 90 }]);
  assert.deepEqual(frames.map((f) => f.delay), [120, 1200]);
  assert.deepEqual(frames.map((f) => f.click), [true, false]);
});

test('a new glide ignores stale script coordinates and continues the preceding beat', async (t) => {
  const { motion, frames } = await fixture(t);
  await motion.snap({ x: 100, y: 100 }, false, 10, 'first');
  await motion.glideTo(-1000, -1000, 200, 100, 4, 'second');
  assert.deepEqual(frames.slice(1).map((f) => f.mouse), [
    { x: 112.5, y: 100 }, { x: 150, y: 100 }, { x: 187.5, y: 100 }, { x: 200, y: 100 },
  ]);
});

test('clicks travel, hover and remove the click ring without losing the cursor', async (t) => {
  const { motion, frames, events } = await fixture(t);
  await motion.snap({ x: 0, y: 0 }, false, 10, 'click');
  await motion.clickSnap({
    boundingBox: async () => ({ x: 90, y: 90, width: 20, height: 20 }),
    click: async () => { events.push(['click']); },
  }, 'click');
  assert.equal(events.at(-1)[0], 'click');
  assert.deepEqual(frames.slice(-3).map((f) => f.click), [false, true, false]);
  assert.ok(frames.slice(-3).every((f) => f.mouse.x === 100 && f.mouse.y === 100));
});

test('optional distance pacing gives long cursor travel more frames', async (t) => {
  const { frames, page, dir } = await fixture(t);
  const motion = snapper(page, dir, frames, null, { settleMs: 0, travelPixelsPerStep: 40 });
  await motion.snap({ x: 0, y: 20 }, false, 10, 'start');
  const target = (x) => ({ boundingBox: async () => ({ x: x - 10, y: 10, width: 20, height: 20 }) });
  await motion.moveSnap(target(400), 'near');
  assert.equal(frames.length, 12); // start + 10 motion frames + hover
  const before = frames.length;
  await motion.moveSnap(target(1600), 'far');
  assert.equal(frames.length - before, 31);
  assert.ok(frames[before].mouse.x > 400 && frames[before].mouse.x < 410);
  assert.equal(frames.at(-1).mouse.x, 1600);
});

test('CJK typing inserts every character and exposes failures', async (t) => {
  const { motion, events } = await fixture(t);
  await motion.typeSnap({
    boundingBox: async () => ({ x: 0, y: 0, width: 20, height: 20 }),
    focus: async () => { events.push(['focus']); },
  }, '登录A', 'type');
  assert.deepEqual(events.filter(([kind]) => kind === 'text'), [['text', '登'], ['text', '录'], ['text', 'A']]);
  await assert.rejects(motion.clickSnap({ boundingBox: async () => null }, 'missing'), /not visible/);
});

test('a failed drag always releases the mouse button', async (t) => {
  const { frames, page, dir, events } = await fixture(t);
  const motion = snapper(page, dir, frames, async () => {
    if (events.some(([kind]) => kind === 'down')) throw new Error('capture failed');
    return Buffer.from('test-frame');
  }, { settleMs: 0 });
  await assert.rejects(motion.dragTo(0, 0, 100, 0, 4, 'drag'), /capture failed/);
  assert.deepEqual(events.at(-1), ['up']);
});

test('drag frames retain the held state and release without a false click', async (t) => {
  const { motion, frames } = await fixture(t);
  await motion.dragTo(10, 20, 90, 20, 4, 'drag');
  assert.equal(frames.filter(f => f.pressed).length, 4);
  assert.ok(frames.every(f => !f.click));
  assert.equal(frames.at(-1).pressed, undefined);
});
