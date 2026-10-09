// Note: runtime messages and quoted text cannot establish personal habits — see .agents/notes/knowledge/requirements/memory-noise-progress-audit.md

/** Match only the complete, known task envelope; mentioning a tag is ordinary text. */
const TASK_NOTIFICATION = /<task-notification>\s*<task-id>[^<>]+<\/task-id>\s*(?:<tool-use-id>[^<>]+<\/tool-use-id>\s*)?(?:<output-file>[^<>]+<\/output-file>\s*)?<status>(?:completed|failed|killed|cancelled)<\/status>\s*<summary>[^<>]+<\/summary>\s*<\/task-notification>/g

export function isRuntimeNotification(content: string): boolean {
  return content.trim().length > 0 && content.replace(TASK_NOTIFICATION, '').trim().length === 0
}

/** A derived evidence view; callers retain original conversation bytes and source hashes. */
export function personalStatementText(content: string): string {
  const prose = content
    .replace(TASK_NOTIFICATION, '\n')
    .replace(/<task-notification>[\s\S]*?(?:<\/task-notification>|$)/g, '\n')
    .replace(/<!--[^]*?(?:-->|$)/g, '\n')
  // Ambiguous prose quotations can span lines. Keep them in the conversation, not automatic evidence.
  if (/[“”「」『』"]|^\s*['‘]/m.test(prose)) return ''
  const lines: string[] = []
  let fence: string | undefined
  let xmlDepth = 0
  for (const raw of prose.split(/\r?\n/)) {
    const line = raw.trim()
    const marker = line.match(/^(`{3,}|~{3,})/)
    if (marker) {
      if (!fence) fence = marker[1]
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && /^(`{3,}|~{3,})\s*$/.test(line)) fence = undefined
      continue
    }
    if (fence || /^(?:>| {4}|\t)/.test(raw)) continue
    // XML examples are evidence being discussed, including multiline element bodies.
    const tags = line.match(/<\/?[A-Za-z][^>]*>/g) ?? []
    const inXml = xmlDepth > 0 || tags.length > 0
    for (const tag of tags) {
      if (tag.startsWith('</')) xmlDepth = Math.max(0, xmlDepth - 1)
      else if (!tag.endsWith('/>')) xmlDepth++
    }
    if (inXml) continue
    if (!line) continue
    if (/[?？]|(?:什么|是否|怎么|吗[。！!]?\s*$)/.test(line)) {
      if (/(?:仅|只|这次|本次|项目|条件)|\b(?:only|unless|except|if)\b/i.test(line)) return ''
      continue
    }
    lines.push(line)
  }
  return lines.join('\n')
}

/** Only explicit, unquoted preferences reinforce habits; personal facts use their own extraction. */
export function personalPreferenceText(content: string): string | undefined {
  const preference = personalStatementText(content)
  if (!preference || preference.length > 1000) return undefined
  for (const line of preference.split('\n')) {
    if (/(?:这次|本次|临时|暂时|今天|本项目|这个项目|该项目|这个仓库|本仓库|例如|比如|示例|举例|假如|假设|如果)|\b(?:this (?:time|project|repo)|for now|today|for example|suppose|if)\b/i.test(line)) return undefined
    const personal = /^(?:我(?:个人)?(?:更?喜欢|偏好|习惯|倾向于|通常|一般)|I\s+(?:personally\s+)?(?:prefer|like|usually|always)\b|My\s+preference\s+is\b)/i.test(line)
    const durableRequest = /^(?:请)?(?:以后|今后|往后|始终|总是|默认).*(?:回答|回复|输出|解释|测试|用|使用)/.test(line)
    const responseStyle = /^(?:请)?(?:用(?:中文|英文|英语|简体中文|繁体中文)(?:回答|回复)|(?:回答|回复|输出)(?:请)?(?:简洁|简短|详细))/.test(line)
    if (!(personal || durableRequest || responseStyle)) return undefined
  }
  return preference
}
