// Publish the exact Windows artifacts only after the neutral-directory runtime gate.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

export function releaseFiles(root, outputDirectory) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const config = parse(readFileSync(join(root, 'electron-builder.yml'), 'utf8'))
  if (config.publish?.provider !== 'github' || !config.publish.owner || !config.publish.repo) throw new Error('A GitHub publish owner and repo are required')
  const prerelease = pkg.version.includes('-')
  const channel = prerelease ? pkg.version.split('-')[1].split('.')[0] : 'latest'
  if (!/^[\w-]+$/.test(channel)) throw new Error('Invalid update channel')
  const directory = outputDirectory ?? join(root, 'release', pkg.version)
  const setup = `${config.productName}-${pkg.version}-x64-setup.exe`
  const portable = `${config.productName}-${pkg.version}-x64-portable.exe`
  const names = [setup, `${setup}.blockmap`, portable, `${channel}.yml`]
  for (const name of names) if (!existsSync(join(directory, name))) throw new Error(`Release artifact missing: ${name}`)
  const update = parse(readFileSync(join(directory, `${channel}.yml`), 'utf8'))
  if (update.version !== pkg.version || update.path !== setup) throw new Error('Update manifest does not match the current version and setup artifact')
  const entry = update.files?.find(({ url }) => url === setup)
  const bytes = readFileSync(join(directory, setup))
  const sha512 = createHash('sha512').update(bytes).digest('base64')
  if (!entry || entry.sha512 !== sha512 || update.sha512 !== sha512 || entry.size !== bytes.length) throw new Error('Setup artifact does not match the update manifest hash and size')
  return { tag: `v${pkg.version}`, repo: `${config.publish.owner}/${config.publish.repo}`, prerelease, files: names.map((name) => join(directory, name)) }
}

export function publishWin(root = process.cwd(), run = (command, args) => execFileSync(command, args, { cwd: root, stdio: 'inherit' })) {
  run(process.execPath, [join(root, 'scripts/check-packaged-runtime.mjs'), '--portable'])
  const release = releaseFiles(root)
  const common = ['--repo', release.repo]
  // A draft keeps partial uploads off the update feed. Never overwrite an
  // existing release: gh create fails if this tag already has a release.
  run('gh', ['release', 'create', release.tag, '--draft', '--verify-tag', '--title', release.tag, '--notes', '', ...(release.prerelease ? ['--prerelease'] : []), ...common])
  run('gh', ['release', 'upload', release.tag, ...release.files, ...common])
  run('gh', ['release', 'edit', release.tag, '--draft=false', `--latest=${!release.prerelease}`, ...common])
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { publishWin() } catch (error) { console.error(error.message); process.exitCode = 1 }
}
