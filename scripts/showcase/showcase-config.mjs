// Note: one script owns each demo; visual defaults are shared — see .agents/notes/desktop/readme-showcase.md
export const layout = {
  width: 1920, height: 1080,
  appWidth: 1760, appHeight: 884, appX: 80, appY: 28,
  captionX: 80, captionY: 952,
};

export const style = {
  theme: 'planche',
  background: { top: [248, 241, 222], bottom: [232, 217, 184], glow: true, grid: true, vignette: 0.12 },
  ink: [28, 52, 59], accent: [200, 48, 32], misprint: [196, 120, 92],
  cursor: { scale: 1.3, fill: [255, 255, 255], stroke: [28, 52, 59], ringRadius: 24 },
};

// Recording helper delays use centiseconds; manifests and GIFEncoder use milliseconds.
// Browser readiness waits remain real milliseconds and are independent of playback speed.
export const timing = {
  tempo: 1, motion: 4, hover: 45, click: 12, hold: 120, typing: 10,
  travelSteps: 16, dragSteps: 20, settleMs: 450,
};

export const demos = {
  hero: { script: 'record-hero.mjs', asset: 'hero-planche', title: '总览' },
  worktree: { script: 'record-worktree.mjs', asset: 'feature-worktree', title: 'Worktree 管理' },
  session: { script: 'record-session.mjs', asset: 'feature-session', title: '会话管理' },
  filetree: { script: 'record-filetree.mjs', asset: 'feature-filetree', title: '文件树' },
  split: { script: 'record-split-quad.mjs', asset: 'feature-split', title: '终端分屏' },
  browser: { script: 'record-browser.mjs', asset: 'feature-browser', title: '内置浏览器' },
  markdown: { script: 'record-markdown.mjs', asset: 'feature-markdown', title: 'Quick Note' },
  blueprint: { script: 'record-blueprint.mjs', asset: 'feature-blueprint-workbench', title: '蓝图' },
  island: { script: 'record-island.mjs', asset: 'feature-island', title: 'Island' },
  product: { script: 'record-product.mjs', asset: 'feature-product', title: '产物工作区' },
};
