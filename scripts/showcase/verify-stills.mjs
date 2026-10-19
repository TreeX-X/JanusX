// Verify current static assets against successful captures and lossless sources.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { PNG } from './showcase-lib.mjs';
import { frameStill, digest, stillDir } from './static-lib.mjs';

const groups = {
  tools: { 'feature-filetree.png': 'dark', 'feature-browser.png': 'planche', 'feature-markdown.png': 'dark' },
  cpa: { 'feature-cpa.png': 'planche', 'feature-cpa-settings.png': 'planche' },
  'external-session': { 'feature-session-external-list.png': 'dark', 'feature-session-external.png': 'dark' },
  usage: { 'feature-usage-drawer.png': 'planche', 'feature-usage-statistics.png': 'planche' },
};
const reports = [];
for (const [feature, expected] of Object.entries(groups)) {
  const { dir } = JSON.parse(await readFile(resolve('.cache/showcase', `${feature}-stills-latest.json`), 'utf8'));
  const report = JSON.parse(await readFile(join(dir, 'stills.json'), 'utf8'));
  assert.equal(report.feature, feature);
  assert.equal(report.accountsCopied, false);
  assert.equal(report.modelCalls, 0);
  assert.deepEqual(report.assets.map(a => a.file).sort(), Object.keys(expected).sort());
  if (feature === 'tools') {
    assert.equal(report.localPreview, true);
    assert.match(report.testOutput, /pass 3/);
  } else if (feature === 'cpa') {
    assert.equal(report.officialBackend, true);
    assert.equal(report.officialFrontend, true);
    assert.equal(report.authenticationFiles, 0);
    assert.equal(report.requests, 0);
    assert.equal(report.assets[0].emptyInstance, true);
    assert.equal(report.assets[1].keyVisible, false);
  } else if (feature === 'external-session') {
    assert.equal(report.scannerImported, true);
    assert.equal(report.sourceUnchanged, true);
    assert.equal(report.assets[1].nativeResumeAvailable, true);
    assert.equal(report.assets[1].resumeExecuted, false);
  } else {
    const manifestBytes = await readFile(join(report.source, 'manifest.json'));
    assert.equal(digest(manifestBytes), report.sourceManifestSha256);
    const manifest = JSON.parse(manifestBytes);
    assert.equal(manifest.feature, 'usage');
    assert.equal(report.sampleData, true);
    for (const asset of report.assets) {
      const frame = manifest.frames[asset.frameIndex];
      assert.equal(frame.cap, asset.stage);
      assert.equal(frame.transition, undefined);
      assert.equal(resolve(asset.rawPath), resolve(report.source, 'frames', frame.file));
    }
  }
  const checked = [];
  for (const asset of report.assets) {
    const bytes = await readFile(join(stillDir, asset.file));
    const raw = await readFile(asset.rawPath);
    assert.equal(digest(bytes), asset.sha256, `${asset.file}: stale or overwritten asset`);
    assert.equal(digest(raw), asset.rawSha256, `${asset.file}: source changed`);
    assert.equal(asset.theme, expected[asset.file]);
    const image = PNG.sync.read(bytes);
    assert.deepEqual([image.width, image.height], [1784, 908]);
    // Exact pixels verify both the full app area and all four background edges.
    assert.ok(image.data.equals(PNG.sync.read(frameStill(raw)).data), `${asset.file}: lossless framing`);
    const native = ['feature-browser.png', 'feature-cpa.png'].includes(asset.file);
    assert.equal(asset.nativeViews?.length ?? 0, native ? 1 : 0);
    checked.push({ file: asset.file, sha256: asset.sha256, bytes: bytes.length, theme: asset.theme });
  }
  const verification = { feature, verifiedAt: new Date().toISOString(), sourceReportSha256: digest(await readFile(join(dir, 'stills.json'))), assets: checked, losslessPixels: true };
  await writeFile(join(dir, 'stills-verification.json'), JSON.stringify(verification, null, 2));
  reports.push(verification);
  console.log(`${feature}: ${checked.length} stills verified`);
}
await writeFile(resolve('.cache/showcase/stills-verification.json'), JSON.stringify(reports, null, 2));
