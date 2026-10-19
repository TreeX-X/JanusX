// Reuse U's verified lossless frames; never decode/recompress the GIF.
import { expect } from 'playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { PNG } from './showcase-lib.mjs';
import { frameStill, finishStills, digest } from './static-lib.mjs';

const source = resolve(process.argv[2] ?? JSON.parse(await readFile('.cache/showcase/usage-latest.json', 'utf8')).dir);
const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'));
expect(manifest.feature).toBe('usage'); expect(manifest.evidence.accountsCopied).toBe(false);
const assets = [];
for (const [name, index, stage] of [['feature-usage-drawer', 22, 'drawer'], ['feature-usage-statistics', 186, 'heatmap']]) {
  const frame = manifest.frames[index]; expect(frame.cap).toBe(stage); expect(frame.transition).toBeUndefined();
  const rawPath = join(source, 'frames', frame.file), raw = await readFile(rawPath);
  const output = frameStill(raw), file = name + '.png';
  await writeFile(join(source, file), output);
  assets.push({ file, sha256: digest(output), rawPath, rawSha256: digest(raw), frameIndex: index, stage, canvas: { width: 1784, height: 908, border: 12 }, theme: 'planche' });
  const decoded = PNG.sync.read(output); expect([decoded.width, decoded.height]).toEqual([1784, 908]);
  console.log(`Exported ${file} from lossless frame ${index}`);
}
await finishStills({ recordingRoot: source }, 'usage', assets, {
  source, sourceManifestSha256: digest(await readFile(join(source, 'manifest.json'))), sampleData: true,
});
