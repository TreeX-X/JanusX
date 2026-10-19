import { expect } from 'playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parseNote, validateNote } from '@janus-agent/harness-core';
import { buildNoteIndex, SUPPORTED_HARNESS_PROFILE, validateModuleStructure } from '@janus-agent/harness-node';
import { git } from './record-lib.mjs';

const beforeDesign = '搜索在本地完成，不改变任务顺序。\n\n空结果保留筛选词，并显示清晰的空态。';
const afterDesign = '搜索在本地完成，不改变任务顺序。\n\n去除首尾空格后，至少两个字符才筛选；不足两个字符时显示全部任务。匹配忽略大小写。\n\n空结果保留筛选词，并显示清晰的空态。';
const files = {
  'package.json': JSON.stringify({ name: 'atlas', type: 'module', scripts: { test: 'node --test' } }, null, 2) + '\n',
  'README.md': '# Atlas\n\nTask board with local title search.\nSearch: src/search.mjs\nValidation: npm test\n',
  'src/search.mjs': "export function filterTasks(tasks, query) {\n  const needle = query.trim().toLowerCase();\n  if (needle.length < 2) return tasks;\n  return tasks.filter(task => task.title.toLowerCase().includes(needle));\n}\n",
  'tests/search.test.mjs': "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { filterTasks } from '../src/search.mjs';\n\nconst tasks = [{ title: 'Search tasks' }, { title: 'Release checklist' }, { title: 'Search empty state' }];\ntest('shows all tasks below two trimmed characters', () => {\n  for (const query of ['', ' s ', '  ']) assert.deepEqual(filterTasks(tasks, query), tasks);\n});\ntest('filters from two characters and ignores case', () => {\n  assert.deepEqual(filterTasks(tasks, ' SE '), [tasks[0], tasks[1], tasks[2]]);\n  assert.deepEqual(filterTasks(tasks, 'SEARCH'), [tasks[0], tasks[2]]);\n});\ntest('preserves order and allows empty results', () => {\n  assert.deepEqual(filterTasks(tasks, 'search'), [tasks[0], tasks[2]]);\n  assert.deepEqual(filterTasks(tasks, 'missing'), []);\n});\n",
};

async function authorNotes(repoPath) {
  const repoId = randomUUID(), keys = ['root', 'search', 'ui', 'overview', 'guide', 'requirement', 'decision'];
  const ids = Object.fromEntries(keys.map(key => [key, randomUUID()]));
  const uri = key => `note://${repoId}/${ids[key]}`;
  const rows = [
    ['root', 'module.md', 'Atlas', 'module', null, '## Responsibility\n\n维护任务看板、搜索与展示体验。\n\n## Design\n\n搜索模块维护筛选行为，界面模块维护展示与验证；项目约定与子模块共同保留。'],
    ['search', 'search/module.md', '任务搜索', 'module', 'root', '## Responsibility\n\n维护本地搜索、任务顺序与空结果行为。\n\n## Design\n\n实现位于 src/search.mjs，搜索约定记录当前规则，变更前核对源码与测试。'],
    ['ui', 'ui/module.md', '界面与验证', 'module', 'root', '## Responsibility\n\n维护任务列表的展示与验证。\n\n## Design\n\n保留搜索输入，在浏览器预览中检查筛选与空态。'],
    ['overview', 'project-guide.md', '项目约定', 'note', 'root', '## Design\n\n先阅读模块职责，再定位相关主题。项目文档与源码相互对照。'],
    ['guide', 'search/search-guide.md', '搜索约定', 'note', 'search', `## Design\n\n${beforeDesign}`],
    ['requirement', 'search/requirements/empty-state.md', '空结果提示', 'requirement', 'search', '## Expected behavior\n\n无匹配时保留搜索词，提供清晰的空态。\n\n## Acceptance criteria\n\n- [ ] AC-1: 空结果保留搜索词，并显示没有匹配任务。'],
    ['decision', 'search/local-filter.md', '本地筛选', 'decision', 'search', '## Problem\n\n短搜索词不应增加网络请求。\n\n## Decision\n\n使用本地标题匹配，保持原有任务顺序。\n\n## Alternatives considered\n\n远程搜索更灵活，但当前项目没有对应需求。\n\n## Consequences\n\n结果即时可用，数据范围限于当前任务列表。'],
  ];
  await mkdir(join(repoPath, '.agents/notes'), { recursive: true });
  await writeFile(join(repoPath, '.agents/harness.json'), JSON.stringify({ schemaVersion: 1, repoId, name: 'Atlas', profile: SUPPORTED_HARNESS_PROFILE }, null, 2));
  const originals = {};
  for (const [key, path, title, kind, owner, body] of rows) {
    const meta = { schema: 'harness-note/2', id: ids[key], kind,
      lifecycle: kind === 'decision' ? 'implemented' : 'accepted', created: '2026-10-18', updated: '2026-10-18T00:00:00Z',
      ...(kind === 'module' ? { moduleState: 'partial', ...(owner ? { parent: uri(owner) } : { role: 'project' }) } : { module: uri(owner) }) };
    const raw = `---\n${JSON.stringify(meta, null, 2)}\n---\n\n# ${title}\n\n${body}\n`;
    expect(validateNote(parseNote(raw)), path).toEqual([]);
    await mkdir(dirname(join(repoPath, '.agents/notes', path)), { recursive: true });
    await writeFile(join(repoPath, '.agents/notes', path), raw);
    originals[path] = raw;
  }
  const index = await buildNoteIndex(repoPath);
  expect(index.readDiagnostics).toEqual([]);
  expect(validateModuleStructure(index.entries, index.repoId)).toEqual([]);
  return { uri, originals, guidePath: join(repoPath, '.agents/notes/search/search-guide.md') };
}

async function buildEvidence() {
  const entry = resolve(process.env.SHOWCASE_ENTRY ?? 'out/main/index.js');
  const root = dirname(dirname(entry)), hash = createHash('sha256');
  async function visit(dir) {
    for (const item of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, item.name);
      if (item.isDirectory()) await visit(path);
      else { hash.update(path.slice(root.length)); hash.update(await readFile(path)); }
    }
  }
  await visit(root);
  return { entry, buildSha256: hash.digest('hex'), recordingHead: git(resolve('.'), 'rev-parse', 'HEAD').trim(),
    buildSourcesPinned: false, workingTreeDirty: Boolean(git(resolve('.'), 'status', '--porcelain').trim()) };
}


export { beforeDesign, afterDesign, files, authorNotes, buildEvidence };
