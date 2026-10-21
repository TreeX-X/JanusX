// Windows-only portable toolchain. Does not modify the registry, PATH or system Java.
import fs from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

if (process.platform !== 'win32') throw new Error('Use Android SDK/JDK installation instructions for your platform')
const root = path.resolve(process.argv[2] || 'D:/JanusX-Android')
const google = 'https://dl.google.com/android/repository/'
const jobs = [
  { name: 'cmdline-tools-latest', url: google+'commandlinetools-win-16111833_latest.zip', sha1: '57d04f2d75eb8e8fffc5000a987e5de4b5a63e9d', target: 'sdk/cmdline-tools/latest' },
  { name: 'platform-tools', url: google+'platform-tools_r37.0.1-win.zip', sha1: 'e03e78b1d80b396f1c3358e31251cb31740e1110', target: 'sdk/platform-tools' },
  { name: 'emulator', url: google+'emulator-windows_x64-16555280.zip', sha1: 'f6dad179df6127fe8d1b6def347b190507fdbbe3', target: 'sdk/emulator' },
  { name: 'platforms-android-35', url: google+'platform-35_r02.zip', sha1: '0bb560a90a7a2cbd0dd8348224d518b638fe7949', target: 'sdk/platforms/android-35' },
  { name: 'build-tools-35.0.0', url: google+'build-tools_r35_windows.zip', sha1: 'af059bb67cf7786f45ee0db85e2d24985df1b4b6', target: 'sdk/build-tools/35.0.0' },
  { name: 'image', url: google+'sys-img/google_apis/x86_64-35_r09.zip', sha1: '0103e6dab21290c4b9d16550a3ce99476f884eef', target: 'sdk/system-images/android-35/google_apis/x86_64' },
  { name: 'jdk-ms', url: 'https://download.visualstudio.microsoft.com/download/pr/a9672056-0a4d-425d-8488-f481ee56319c/ac8d1216f7d03a27c018bc960f947721/microsoft-jdk-17.0.20.1-windows-x64.zip', sha256: '3d9006956fc8af5601cd24ffc4f468bef48279c7ebd8171b9bdf90d0aabfbf1f' },
  { name: 'gradle-huawei', url: 'https://services.gradle.org/distributions/gradle-8.9-bin.zip', fallback: 'https://mirrors.huaweicloud.com/gradle/gradle-8.9-bin.zip', sha256: 'd725d707bfabd4dfdc958c624003b3c80accc03f7037b5122c4b1d0ef15cecab' },
]
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true })
async function checksum(file, algorithm) {
  if (!fs.existsSync(file)) return ''
  const hash = createHash(algorithm)
  for await (const part of fs.createReadStream(file)) hash.update(part)
  return hash.digest('hex')
}
const results = await Promise.allSettled(jobs.map(async job => {
  const archive = path.join(root, 'downloads', job.name+'.zip')
  const algorithm = job.sha256 ? 'sha256' : 'sha1', expected = job.sha256 || job.sha1
  if (await checksum(archive, algorithm) !== expected) {
    const sources = [job.url, job.fallback].filter(Boolean)
    for (let i = 0; i < sources.length; i++) {
      try {
        console.log('Downloading '+job.name+(i ? ' from checksum-verified fallback mirror' : ''))
        const res = await fetch(sources[i], { signal: AbortSignal.timeout(i || sources.length === 1 ? 1200000 : 30000) })
        if (!res.ok) throw new Error('HTTP '+res.status)
        await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(archive))
        if (await checksum(archive, algorithm) !== expected) throw new Error('Checksum mismatch')
        break
      } catch (error) { if (i === sources.length-1) throw new Error(job.name+': '+error.message) }
    }
  }
  console.log('Verified '+job.name)
  const destination = job.target ? path.join(root, 'unpack', job.name) : root
  fs.mkdirSync(destination, { recursive: true })
  const result = spawnSync('tar.exe', ['-xf', archive, '-C', destination], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(job.name+': '+result.stderr)
  if (job.target) {
    const source = fs.readdirSync(destination).find(name => fs.statSync(path.join(destination,name)).isDirectory())
    if (!source) throw new Error('No archive root: '+job.name)
    fs.cpSync(path.join(destination,source), path.join(root,job.target), { recursive: true })
  }
  console.log('Installed '+job.name)
}))
for (const result of results) if (result.status === 'rejected') { console.error(result.reason.message); process.exitCode = 1 }
if (!process.exitCode) console.log('Ready: powershell -File scripts/android-lab/run.ps1 -Action Prepare')
