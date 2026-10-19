// Recompose the actual UI capture without changing its contents.
// Run from repository root: node wiki/assets/readme/render-hero.cjs
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
(async () => {
  const root = path.resolve('wiki/assets/readme');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(path.join(root, 'showcase-background.svg')).href);
    await page.screenshot({ path: path.join(root, 'showcase-background.png'), omitBackground: false });
    await page.goto(pathToFileURL(path.join(root, 'hero-source.html')).href);
    await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    await page.locator('main').screenshot({ path: path.join(root, 'janus-overview.png') });
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
