import { describe, expect, it } from 'vitest'
import {
  composeShellEntryLaunch,
  composeShellLaunchFromCommandLine,
  createShellProfileSeed,
  describeShellEntry,
  getDefaultShellEntry,
  isCliPresetHidden,
  listVisibleCliPresets,
  listVisibleShellEntries,
  normalizeShellProfiles,
  parseCommandLine,
  quoteCommandToken,
  shellCandidateProbes,
  shellEntryExecutable,
  type ShellProfileEntry,
} from '../../src/shared/shellProfiles'

function entry(overrides: Partial<ShellProfileEntry> = {}): ShellProfileEntry {
  return {
    id: 'shell-1',
    name: 'Bash',
    command: 'bash',
    visible: true,
    isDefault: false,
    ...overrides,
  }
}

describe('shell profile entries', () => {
  it('seeds exactly one PowerShell default entry on Windows', () => {
    const seed = createShellProfileSeed('win32')
    expect(seed).toMatchObject({ name: 'PowerShell', command: 'powershell.exe', isDefault: true, visible: true })
    expect(createShellProfileSeed('linux')).toMatchObject({ name: 'Bash', command: 'bash', isDefault: true })
  })

  it('keeps an emptied entry list empty (no re-seed on read)', () => {
    expect(normalizeShellProfiles({ entries: [], hiddenCliPresets: [] }).entries).toEqual([])
    expect(normalizeShellProfiles(undefined).entries).toEqual([])
  })

  it('keeps a command-less entry as an editable draft, out of the entry points', () => {
    const settings = normalizeShellProfiles({
      entries: [
        entry({ id: 'draft', command: '' }),
        entry({ id: 'ready', command: 'bash' }),
      ],
      hiddenCliPresets: [],
    })
    expect(settings.entries.map((item) => item.id)).toEqual(['draft', 'ready'])
    // 草稿不能当默认项，也不出现在新建入口
    expect(settings.entries.find((item) => item.isDefault)?.id).toBe('ready')
    expect(listVisibleShellEntries(settings).map((item) => item.id)).toEqual(['ready'])
  })

  it('drops entries with neither a name nor a command and de-duplicates ids', () => {
    const settings = normalizeShellProfiles({
      entries: [
        entry({ id: 'a' }),
        entry({ id: 'a', name: 'duplicate' }),
        { id: 'b', name: '', command: '   ' },
      ],
      hiddenCliPresets: [],
    })
    expect(settings.entries.map((item) => item.id)).toEqual(['a'])
  })

  it('falls back to a slug id when one is missing', () => {
    const settings = normalizeShellProfiles({
      entries: [{ name: 'Git Bash', command: 'bash.exe' }],
      hiddenCliPresets: [],
    })
    expect(settings.entries[0].id).toBe('shell-git-bash')
    expect(settings.entries[0].name).toBe('Git Bash')
  })

  it('enforces a single default, preferring the first visible entry', () => {
    const marked = normalizeShellProfiles({
      entries: [entry({ id: 'a', isDefault: true }), entry({ id: 'b', isDefault: true })],
      hiddenCliPresets: [],
    })
    expect(marked.entries.filter((item) => item.isDefault).map((item) => item.id)).toEqual(['a'])

    const unmarked = normalizeShellProfiles({
      entries: [entry({ id: 'a', visible: false }), entry({ id: 'b' })],
      hiddenCliPresets: [],
    })
    expect(unmarked.entries.find((item) => item.isDefault)?.id).toBe('b')
  })

  it('falls back to the first launchable entry when the marked default is not', () => {
    const settings = normalizeShellProfiles({
      entries: [entry({ id: 'a', command: '' }), entry({ id: 'b' })],
      hiddenCliPresets: [],
    })
    expect(getDefaultShellEntry(settings)?.id).toBe('b')
  })

  it('normalizes hidden CLI presets and drops duplicates', () => {
    const settings = normalizeShellProfiles({
      entries: [entry()],
      hiddenCliPresets: ['claude', 'claude', 'codex', 42],
    })
    expect(settings.hiddenCliPresets).toEqual(['claude', 'codex'])
  })
})

describe('parseCommandLine', () => {
  it('splits plain argv', () => {
    expect(parseCommandLine('bash --login -i')).toEqual(['bash', '--login', '-i'])
  })

  it('keeps quoted Windows paths in one token', () => {
    expect(parseCommandLine('"C:\\Program Files\\Git\\bin\\bash.exe" --login -i')).toEqual([
      'C:\\Program Files\\Git\\bin\\bash.exe',
      '--login',
      '-i',
    ])
  })

  it('supports single quotes and embedded spaces', () => {
    expect(parseCommandLine("ssh 'user@my host' -p 22")).toEqual(['ssh', 'user@my host', '-p', '22'])
  })

  it('returns nothing for blank input', () => {
    expect(parseCommandLine('   ')).toEqual([])
  })
})

describe('shell launch composition', () => {
  it('appends the suffix as trailing argv after the command argv', () => {
    const launch = composeShellEntryLaunch(entry({ command: 'bash --noprofile', suffix: '--login -i' }))
    expect(launch).toEqual({ command: 'bash', args: ['--noprofile', '--login', '-i'] })
  })

  it('composes a whole launch line the same way', () => {
    expect(composeShellLaunchFromCommandLine('"C:\\Git\\bin\\bash.exe" --login -i')).toEqual({
      command: 'C:\\Git\\bin\\bash.exe',
      args: ['--login', '-i'],
    })
  })

  it('returns null when there is no command to run', () => {
    expect(composeShellEntryLaunch(entry({ command: '  ' }))).toBeNull()
    expect(composeShellLaunchFromCommandLine('')).toBeNull()
  })

  it('describes the full launch line for display, restore and retry', () => {
    expect(describeShellEntry(entry({ command: 'bash', suffix: '--login -i' }))).toBe('bash --login -i')
    expect(describeShellEntry(entry({ command: 'pwsh' }))).toBe('pwsh')
  })

  it('quotes a detected path with spaces so it parses as one token', () => {
    const detected = 'C:\\Program Files\\Git\\cmd\\bash.exe'
    const prefilled = quoteCommandToken(detected)
    expect(prefilled).toBe(`"${detected}"`)
    expect(parseCommandLine(prefilled)).toEqual([detected])
    expect(shellEntryExecutable(entry({ command: prefilled }))).toBe('bash')
    expect(composeShellEntryLaunch(entry({ command: prefilled, suffix: '--login -i' }))).toEqual({
      command: detected,
      args: ['--login', '-i'],
    })
  })

  it('leaves a token without whitespace unquoted', () => {
    expect(quoteCommandToken('bash')).toBe('bash')
    expect(quoteCommandToken('  ')).toBe('')
  })

  it('matches entries against candidates by executable name', () => {
    // 带空格的绝对路径必须加引号才是单个 token，否则按空格拆开（见上面的 quoting 用例）。
    expect(shellEntryExecutable(entry({ command: '"C:\\Program Files\\Git\\bin\\bash.exe"' }))).toBe('bash')
    expect(shellEntryExecutable(entry({ command: 'C:\\Git\\bin\\bash.exe' }))).toBe('bash')
    expect(shellEntryExecutable(entry({ command: 'PowerShell.EXE -NoLogo' }))).toBe('powershell')
    expect(shellEntryExecutable(entry({ command: 'bash --login -i' }))).toBe('bash')
  })
})

describe('entry-point visibility', () => {
  const settings = normalizeShellProfiles({
    entries: [
      entry({ id: 'a', visible: true, isDefault: true }),
      entry({ id: 'b', name: 'Hidden', visible: false }),
      entry({ id: 'c', visible: true }),
    ],
    hiddenCliPresets: ['codex'],
  })

  it('offers only visible entries and the single default', () => {
    expect(listVisibleShellEntries(settings).map((item) => item.id)).toEqual(['a', 'c'])
    expect(getDefaultShellEntry(settings)?.id).toBe('a')
  })

  it('hides CLI presets only at the new-terminal entries', () => {
    expect(isCliPresetHidden(settings, 'codex')).toBe(true)
    expect(isCliPresetHidden(settings, 'claude')).toBe(false)
    expect(listVisibleCliPresets(settings, ['janus', 'claude', 'codex'])).toEqual(['janus', 'claude'])
  })
})

describe('shell candidate probes', () => {
  it('probes Git Bash bash.exe with a login suffix on Windows, without WSL', () => {
    const probes = shellCandidateProbes('win32')
    expect(probes.map((probe) => probe.executable)).toEqual(['bash', 'pwsh', 'powershell', 'cmd'])
    expect(probes[0]).toMatchObject({ suggestedName: 'Git Bash', suggestedSuffix: '--login -i' })
  })

  it('probes POSIX shells', () => {
    expect(shellCandidateProbes('darwin').map((probe) => probe.executable)).toEqual(['zsh', 'bash', 'fish', 'sh'])
  })
})
