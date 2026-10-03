import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { snapper } from '../../scripts/showcase/record-motion.mjs';

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
