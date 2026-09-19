// Optional media tools: npm install --prefix .cache/product-media --no-save --package-lock=false gifenc sharp
import { createRequire } from 'node:module'
import { readFile, writeFile, readdir, rename, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
const require = createRequire(resolve('.cache/product-media/package.json'))
const sharp = require('sharp')
const { GIFEncoder, quantize, applyPalette } = require('gifenc')
const recordings = JSON.parse(await readFile('.cache/product-recordings/latest.json', 'utf8'))
const captions = {
  'terminal-split': ['01 / CORE', 'Janus-agentX + Claude Code，拖拽分屏并行工作'],
  'right-sidebar': ['02 / EVERYDAY', '在 Janus-agentX 旁切换文件、Git 与编辑器'],
  'janus-cli': ['03 / EXPERIMENTAL', 'Janus-agentX CLI · 终端里的 Agent 工作台'],
  'roundtable': ['04 / EXPERIMENTAL', '圆桌 · 为复杂问题准备多角色讨论'],
  'blueprint': ['05 / EXPERIMENTAL', '蓝图 · 展开项目结构，查看节点详情'],
  'knowledge': ['06 / EXPERIMENTAL', '知识库 · 审核项目知识，保留来源线索'],
}
async function writeAsset(name, data) {
  const target = resolve('wiki/assets', name)
  const temporary = `${target}.${process.pid}.tmp`
  try {
    await writeFile(temporary, data)
    await rename(temporary, target)
  } finally {
    await rm(temporary, { force: true })
  }
}
for (const recording of recordings) {
  const files = (await readdir(recording.frames)).filter(name => name.endsWith('.png')).sort()
  const [kicker, title] = captions[recording.name]
  const banner = Buffer.from(`<svg width="1280" height="64" xmlns="http://www.w3.org/2000/svg"><rect width="1280" height="64" fill="#101012"/><path d="M0 63.5H1280" stroke="#363638"/><text x="24" y="37" font-family="Consolas,monospace" font-size="12" fill="#ff9159">${kicker}</text><text x="208" y="39" font-family="Microsoft YaHei,sans-serif" font-size="18" fill="#f5f5f5">${title}</text><text x="1180" y="38" font-family="Segoe UI,sans-serif" font-size="15" fill="#a1a1a1">JanusX</text></svg>`)
  const sampleBuffers = []
  for (let i = 0; i < files.length; i += 5) sampleBuffers.push(await sharp(join(recording.frames, files[i])).resize(256,160).ensureAlpha().raw().toBuffer())
  const palette = quantize(Buffer.concat(sampleBuffers), 255)
  const gifPalette = palette.slice()
  while (gifPalette.length < 256) gifPalette.push([0, 0, 0])
  const gif = GIFEncoder()
  let previous
  for (let i = 0; i < files.length; i++) {
    const raw = await sharp(join(recording.frames, files[i])).extend({ top:64, bottom:0, left:0, right:0, background:'#101012' }).composite([{input:banner,top:0,left:0}]).ensureAlpha().raw().toBuffer()
    const pixels = applyPalette(raw, palette)
    const opaque = pixels.slice()
    if (previous) for (let p = 0; p < pixels.length; p++) if (pixels[p] === previous[p]) pixels[p] = 255
    gif.writeFrame(pixels, 1280, 864, { palette: i === 0 ? gifPalette : undefined, delay: 250, transparent: i > 0, transparentIndex: 255, dispose: 1, repeat:0 })
    previous = opaque
    if (i === files.length - 1) await writeAsset(`${recording.name}.png`, await sharp(raw, {raw:{width:1280,height:864,channels:4}}).png().toBuffer())
  }
  gif.finish()
  await writeAsset(`${recording.name}.gif`, gif.bytes())
  console.log(`${recording.name}: ${files.length} frames, ${(gif.bytes().length / 1024 / 1024).toFixed(2)} MB`)
}
