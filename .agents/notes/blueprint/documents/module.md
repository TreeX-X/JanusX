---
{
  "schema": "harness-note/2",
  "id": "bd612cd8-0676-4c46-98ba-81d1dc008505",
  "kind": "module",
  "lifecycle": "accepted",
  "created": "2026-10-08",
  "updated": "2026-10-08T16:26:06.466Z",
  "parent": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/f12d99b4-c116-48dc-96d9-e3ac74ae41cd",
  "moduleState": "partial",
  "codeRefs": [
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/main/notes/note-provider.ts",
      "role": "entry"
    },
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/renderer/src/components/blueprint/NoteWikiPanel.tsx",
      "role": "implementation"
    },
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/shared/note-wiki.ts",
      "role": "implementation"
    }
  ]
}
---

# 工程文档读取与 wiki

## Responsibility

复用 agentX 的 NoteReadSnapshot，提供工程正文、元数据、引用、反链和 wiki 目录。共享包维护解析、索引与身份；本模块维护 Janus 的读取适配和文档阅读入口。

## Design

同一快照供 wiki 与蓝图投影消费，正文按需读取并保留原始来源哈希。文档命名空间、历史迁移和机械检查在此归档；共享编辑事务由 agentX 提供，蓝图交互见 [职责入口](../navigation/module.md)。知识 Wiki 的生成与审核仍由记忆与知识模块负责。

模块和其他 Note 正文中的内部跳转链接使用轻量标签：继承所在段落的字体、字号和字重，与正文基线对齐，左右各留 0.3em 间距，内部留白与上下间距避免边框贴字或邻行相碰。标签采用主题强调色的细边框和淡底；悬停与键盘聚焦时使用已定义的 `--accent-mid` 淡色底、正文文字色和强调色边框，避免未定义主题变量回退为深棕底。颜色以 140ms 过渡，减少动态效果设置下取消过渡；键盘焦点另保留外轮廓。长标题在标签内换行，最大宽度为相邻标点预留空间；样式只覆盖正文链接，目录、关系列表和操作按钮保持各自布局。链接解析、锚点和跨模块导航沿用原机制。

## Verification

2026-10-09（北京时间）正文标签样式由 Main 自检。`npx playwright test tests/e2e/note-wiki.spec.ts tests/e2e/blueprint-v2.spec.ts --project=island --workers=1` 最终 14 项通过；首轮首次双击 Reader 模块场景出现一次超时，本次未修改导航代码或该测试。临时检查 `node artifacts/inline-note-links/verify.mjs` 覆盖两种入口、两种窗口宽度和亮暗主题共 8 个组合，核对正文两侧实际间距、字号继承、长标题无横向溢出、焦点可见及 Enter 跳转。截图人工检查中英文混排、连续链接和长标签；本地证据保留于 `artifacts/inline-note-links/`，未纳入版本库。本次未做 Electron 打包验收。

悬停修正后，`npx playwright test tests/e2e/note-wiki.spec.ts --project=island --workers=1` 两项通过。`node artifacts/inline-note-hover/verify.mjs` 的 8 个组合分别检查普通、纯鼠标悬停和键盘焦点状态；样本文字悬停对比度最低 8.20:1，Enter 跳转及减少动态效果设置通过。截图人工确认悬停底色融入亮暗主题；本地脚本、测量和截图位于 `artifacts/inline-note-hover/`，未纳入版本库。
