// Note: one script owns each demo; visual defaults are shared — see .agents/notes/desktop/readme-showcase.md
export const layout = {
  width: 1920, height: 1080,
  appWidth: 1760, appHeight: 884, appX: 80, appY: 28,
  captionX: 80, captionY: 952,
};

export const style = {
  theme: 'planche',
  background: { asset: 'wiki/assets/readme/showcase-background.png' },
  ink: [28, 52, 59], accent: [212, 61, 42],
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
  worktree: { script: 'record-worktree.mjs', asset: 'feature-worktree', title: 'Worktree 管理', framing: 'compact', assetDirectory: 'readme/features' },
  session: { script: 'record-session.mjs', asset: 'feature-session', title: '会话管理', framing: 'compact', assetDirectory: 'readme/features' },
  filetree: { script: 'record-filetree.mjs', asset: 'feature-filetree', title: '文件树' },
  split: { script: 'record-split-quad.mjs', asset: 'feature-split', title: '终端分屏', framing: 'compact', assetDirectory: 'readme/features' },
  workspace: { script: 'record-workspace-layout.mjs', asset: 'feature-workspace-layout', title: '特色协同分屏', framing: 'compact', assetDirectory: 'readme/features' },
  browser: { script: 'record-browser.mjs', asset: 'feature-browser', title: '内置浏览器' },
  markdown: { script: 'record-markdown.mjs', asset: 'feature-markdown', title: 'Quick Note' },
  blueprint: { script: 'record-blueprint.mjs', asset: 'feature-blueprint-workbench', title: '蓝图对话维护', framing: 'compact', assetDirectory: 'readme/features' },
  review: { script: 'record-blueprint-review.mjs', asset: 'feature-blueprint-review', title: '蓝图自动审核与修复', framing: 'compact', assetDirectory: 'readme/features' },
  usage: { script: 'record-usage.mjs', asset: 'feature-usage', title: '终端与历史用量', framing: 'compact', assetDirectory: 'readme/features' },
  island: { script: 'record-island.mjs', asset: 'feature-island-chat', title: 'Island 对话', framing: 'compact', assetDirectory: 'readme/features' },
  launch: { script: 'record-launch.mjs', asset: 'feature-run-config', title: '运行配置对话生成', framing: 'compact', assetDirectory: 'readme/features' },
  product: { script: 'record-product.mjs', asset: 'feature-product', title: '产物工作区', framing: 'compact', assetDirectory: 'readme/features' },
};
