import type {
  FeishuRemoteProviderConfig,
} from '../../../shared/notifications'
import type {
  RemoteNotificationEvent,
  RemoteNotificationProvider,
  RemoteProviderSendOptions,
} from '../types'

const FEISHU_OPEN_API_BASE = 'https://open.feishu.cn/open-apis'

interface FeishuApiResponse {
  code?: number
  msg?: string
  tenant_access_token?: string
}

export class FeishuRemoteNotificationProvider implements RemoteNotificationProvider {
  readonly id = 'feishu' as const

  async send(
    event: RemoteNotificationEvent,
    config: FeishuRemoteProviderConfig,
    options: RemoteProviderSendOptions,
  ): Promise<void> {
    validateConfig(config)
    const card = buildFeishuCard(event)

    if (config.mode === 'app') {
      await this.sendAppMessage(config, card, options)
      return
    }

    const response = await postJson<FeishuApiResponse>(
      config.webhookUrl.trim(),
      {
        msg_type: 'interactive',
        card,
      },
      options.timeoutMs,
    )
    assertFeishuOk(response, 'send webhook')
  }

  async test(
    config: FeishuRemoteProviderConfig,
    options: RemoteProviderSendOptions,
  ): Promise<void> {
    await this.send(
      {
        id: `test:${Date.now()}`,
        engine: 'codex',
        type: 'attention',
        title: 'JanusX remote notification test',
        body: 'Feishu remote notification is configured correctly.',
        createdAt: new Date().toISOString(),
        severity: 'info',
      },
      config,
      options,
    )
  }

  private async sendAppMessage(
    config: FeishuRemoteProviderConfig,
    card: unknown,
    options: RemoteProviderSendOptions,
  ): Promise<void> {
    const tokenResponse = await postJson<FeishuApiResponse>(
      `${FEISHU_OPEN_API_BASE}/auth/v3/tenant_access_token/internal`,
      {
        app_id: config.appId.trim(),
        app_secret: config.appSecret.trim(),
      },
      options.timeoutMs,
    )
    assertFeishuOk(tokenResponse, 'get tenant access token')

    const token = tokenResponse.tenant_access_token
    if (!token) throw new Error('Feishu did not return tenant_access_token')

    const sendResponse = await postJson<FeishuApiResponse>(
      `${FEISHU_OPEN_API_BASE}/im/v1/messages?receive_id_type=${config.receiveIdType}`,
      {
        receive_id: config.receiveId.trim(),
        msg_type: 'interactive',
        content: JSON.stringify(card),
      },
      options.timeoutMs,
      {
        Authorization: `Bearer ${token}`,
      },
    )
    assertFeishuOk(sendResponse, 'send message')
  }
}

function validateConfig(config: FeishuRemoteProviderConfig): void {
  if (config.mode === 'app') {
    if (!config.appId.trim()) throw new Error('Feishu app_id is required')
    if (!config.appSecret.trim()) throw new Error('Feishu app_secret is required')
    if (!config.receiveId.trim()) throw new Error('Feishu receive_id is required')
    return
  }

  if (!config.webhookUrl.trim()) throw new Error('Feishu webhook URL is required')
}

function assertFeishuOk(response: FeishuApiResponse, action: string): void {
  if (response.code === 0) return
  throw new Error(`Feishu ${action} failed: ${response.msg ?? `code ${response.code ?? 'unknown'}`}`)
}

async function postJson<T = unknown>(
  url: string,
  body: unknown,
  timeoutMs: number,
  headers: Record<string, string> = {},
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const text = await response.text()
    const parsed = text ? JSON.parse(text) : {}

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text || response.statusText}`)
    }

    return parsed as T
  } finally {
    clearTimeout(timer)
  }
}

function buildFeishuCard(event: RemoteNotificationEvent): Record<string, unknown> {
  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      template: headerTemplate(event),
      title: {
        tag: 'plain_text',
        content: event.title,
      },
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: buildMarkdown(event),
        },
      },
      {
        tag: 'hr',
      },
      {
        tag: 'note',
        elements: [
          {
            tag: 'plain_text',
            content: 'JanusX Remote Notify',
          },
        ],
      },
    ],
  }
}

function headerTemplate(event: RemoteNotificationEvent): string {
  switch (event.severity) {
    case 'success':
      return 'green'
    case 'warning':
      return 'orange'
    case 'error':
      return 'red'
    default:
      return 'blue'
  }
}

function buildMarkdown(event: RemoteNotificationEvent): string {
  const lines = [
    `**Event**: ${event.type}`,
    `**Agent**: ${event.engine}`,
    `**Time**: ${formatTime(event.createdAt)}`,
    `**Message**: ${escapeMarkdown(event.body)}`,
  ]

  if (event.terminalId) lines.push(`**Terminal**: ${event.terminalId}`)
  if (event.workspacePath) lines.push(`**Workspace**: ${escapeMarkdown(event.workspacePath)}`)

  return lines.join('\n')
}

function formatTime(value: string): string {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return value
  return new Date(timestamp).toLocaleString()
}

function escapeMarkdown(value: string): string {
  return value.replace(/\r?\n/g, ' ').trim()
}
