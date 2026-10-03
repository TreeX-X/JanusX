import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { demos } from './showcase-config.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const [command = 'list', ...ids] = process.argv.slice(2);
if (command === 'list') {
  for (const [id, demo] of Object.entries(demos)) console.log(`${id.padEnd(10)} ${demo.script.padEnd(24)} → ${demo.asset}.gif  ${demo.title}`);
} else {
  if (!['record', 'compose', 'build'].includes(command) || !ids.length || ids.some((id) => !demos[id])) {
    console.error('Usage: node scripts/showcase/run.mjs list | record|compose|build <feature> [feature ...]');
    process.exit(1);
  }
  const run = (...args) => {
    const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  };
  // Sequential Electron runs keep recordings independent and avoid competing windows.
  for (const id of ids) {
    if (command !== 'compose') run(`scripts/showcase/${demos[id].script}`);
    if (command !== 'record') run('scripts/showcase/compose.mjs', `--feature=${id}`);
  }
}
