import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { timing } from './showcase-config.mjs';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
export const easeOutExpo = (t) => t >= 1 ? 1 : 1 - 2 ** (-10 * t);

/** Every beat starts at the preceding cursor position, including holds and drags.
 * shot can capture native views; overrides change one demo without forking helpers. */
export function snapper(page, rawDir, frames, shot = null, overrides = {}) {
  const pace = { ...timing, ...overrides };
  let lastMouse = null;
  const take = shot ?? ((pg) => pg.screenshot({ type: 'png' }));
  const box = async (loc) => {
    const rect = await loc.boundingBox();
    if (!rect) throw new Error('Recording target is not visible');
    return rect;
  };
  const center = (bb) => ({ x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 });

  async function snap(mouse, click = false, delay = pace.hold, cap) {
    if (mouse) lastMouse = { x: mouse.x, y: mouse.y };
    const file = `p-${String(frames.length).padStart(4, '0')}.png`;
    await writeFile(join(rawDir, file), await take(page));
    frames.push({ file, mouse: lastMouse && { ...lastMouse }, click: !!click,
      delay: Math.max(10, Math.round(delay * 10 * pace.tempo)), cap });
  }

  // x1/y1 seed the first move only; later beats continue from the actual last frame.
  async function glideTo(x1, y1, x2, y2, steps = pace.travelSteps, cap) {
    const start = lastMouse ?? { x: x1, y: y1 };
    const count = Math.hypot(x2 - start.x, y2 - start.y) < 3 ? 1 : steps;
    for (let i = 1; i <= count; i++) {
      const t = easeInOut(i / count);
      const mouse = { x: start.x + (x2 - start.x) * t, y: start.y + (y2 - start.y) * t };
      await page.mouse.move(mouse.x, mouse.y);
      await snap(mouse, false, pace.motion, cap);
    }
  }
  async function travel(c, cap) {
    await glideTo(c.x, c.y, c.x, c.y, pace.travelSteps, cap);
  }
  async function moveSnap(loc, cap, delay = pace.hover) {
    const c = center(await box(loc));
    await travel(c, cap);
    await sleep(pace.settleMs);
    await snap(c, false, delay, cap);
    return c;
  }
  async function clickSnap(loc, cap, { double = false } = {}) {
    const c = await moveSnap(loc, cap);
    if (double) await loc.dblclick();
    else await loc.click();
    await snap(c, true, pace.click, cap);
    await sleep(pace.settleMs);
    await snap(c, false, pace.motion, cap);
    return c;
  }
  async function typeSnap(loc, text, cap, { delay = pace.typing, lead = pace.hover, gap = 0 } = {}) {
    const c = await moveSnap(loc, cap, lead);
    await loc.focus();
    for (const ch of text) {
      // insertText supports CJK too; keyboard.press only accepts key names.
      await page.keyboard.insertText(ch);
      if (gap) await sleep(gap);
      await snap(c, false, delay, cap);
    }
    return c;
  }
  async function dragTo(x1, y1, x2, y2, steps = pace.dragSteps, cap) {
    await travel({ x: x1, y: y1 }, cap);
    await snap(null, false, pace.hover, cap);
    await page.mouse.down();
    try {
      for (let i = 1; i <= steps; i++) {
        const t = easeInOut(i / steps);
        const mouse = { x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t };
        await page.mouse.move(mouse.x, mouse.y);
        await snap(mouse, false, pace.motion, cap);
      }
    } finally {
      await page.mouse.up();
    }
    await snap(null, true, pace.click, cap);
    await sleep(pace.settleMs);
    await snap(null, false, pace.motion, cap);
  }
  const rest = (cap, delay = pace.hold) => snap(null, false, delay, cap);
  return { box, center, snap, glideTo, moveSnap, clickSnap, typeSnap, dragTo, rest };
}
