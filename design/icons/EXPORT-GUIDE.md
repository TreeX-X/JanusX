# SwitchX 应用图标导出指南

基于 `logo-x-only.html` 设计，已生成标准应用图标尺寸。

## 📦 生成的文件

### 应用图标
- **switchx-icon-1024.html** - 1024×1024 (macOS 主图标)
- **switchx-icon-256.html** - 256×256 (Windows 图标)
- **switchx-favicon-32.html** - 32×32 (网站 Favicon，含深色/透明两版)

## 🎨 设计特点

- **X 第一笔**：黑色 `#0a0a0a`（融入背景，产生立体感）
- **X 第二笔**：橙色渐变 `#ff8844` → `#ff7830`（视觉焦点）
- **背景**：深色渐变 `#1a1a1a` → `#0a0a0a`
- **圆角**：macOS 226px / Windows 28px / Favicon 无圆角

## 📥 导出为 PNG

### 方法 1：浏览器截图（推荐）
1. 双击打开 HTML 文件
2. 使用浏览器截图扩展（如 Awesome Screenshot）
3. 选择"捕获选定区域" → 截取 SVG 区域
4. 保存为 PNG

### 方法 2：开发者工具
1. 双击打开 HTML 文件
2. F12 开发者工具 → Elements 面板
3. 右键 `<svg>` → Copy → Copy element
4. 粘贴到 Figma/Sketch
5. 导出为 PNG（2x/3x 分辨率）

### 方法 3：命令行（需安装工具）
```bash
# 安装 playwright（一次性）
npm install -g playwright
npx playwright install chromium

# 批量导出
npx playwright screenshot "file:///E:/Tree Workspace/SwitchX/design-mockups/icons/app-icons/switchx-icon-1024.html" switchx-1024.png --full-page

npx playwright screenshot "file:///E:/Tree Workspace/SwitchX/design-mockups/icons/app-icons/switchx-icon-256.html" switchx-256.png --full-page

npx playwright screenshot "file:///E:/Tree Workspace/SwitchX/design-mockups/icons/app-icons/switchx-favicon-32.html" switchx-32.png --full-page
```

## 📐 标准尺寸需求

### macOS (.icns)
需要多个尺寸：16, 32, 64, 128, 256, 512, 1024
- 使用 **switchx-icon-1024.html** 导出 1024×1024
- 用 `iconutil` 或 Image2icon 工具生成 .icns

### Windows (.ico)
需要：16, 32, 48, 256
- 使用 **switchx-icon-256.html** 导出 256×256
- 用在线工具或 ImageMagick 转换为 .ico

### Linux (.png)
通常需要：16, 32, 48, 64, 128, 256, 512
- 直接使用导出的 PNG 文件

### Web Favicon
- 使用 **switchx-favicon-32.html** 导出 32×32 透明背景版本
- 保存为 `favicon.png` 或转换为 `favicon.ico`

## 🚀 快速生成 icns/ico

### macOS 生成 .icns
```bash
# 创建 iconset 目录
mkdir SwitchX.iconset

# 导出 PNG 后，用 sips 生成多尺寸
sips -z 16 16 switchx-1024.png --out SwitchX.iconset/icon_16x16.png
sips -z 32 32 switchx-1024.png --out SwitchX.iconset/icon_16x16@2x.png
sips -z 32 32 switchx-1024.png --out SwitchX.iconset/icon_32x32.png
sips -z 64 64 switchx-1024.png --out SwitchX.iconset/icon_32x32@2x.png
sips -z 128 128 switchx-1024.png --out SwitchX.iconset/icon_128x128.png
sips -z 256 256 switchx-1024.png --out SwitchX.iconset/icon_128x128@2x.png
sips -z 256 256 switchx-1024.png --out SwitchX.iconset/icon_256x256.png
sips -z 512 512 switchx-1024.png --out SwitchX.iconset/icon_256x256@2x.png
sips -z 512 512 switchx-1024.png --out SwitchX.iconset/icon_512x512.png
cp switchx-1024.png SwitchX.iconset/icon_512x512@2x.png

# 生成 .icns
iconutil -c icns SwitchX.iconset
```

### Windows 生成 .ico
```bash
# 使用 ImageMagick
magick convert switchx-256.png -define icon:auto-resize=256,48,32,16 switchx.ico
```

## 📝 注意事项

- PNG 导出时确保**无损压缩**
- macOS 图标必须包含 @2x 高清版本
- Favicon 建议同时提供 .png 和 .ico 格式
- 透明背景版本用于 Dock/任务栏，深色背景版本用于网站

---

_设计来源：logo-x-only.html（一黑一橙双色 X）_
_最后更新：2026-06-10_