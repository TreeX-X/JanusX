import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { UserPersonaCards } from '../../../src/renderer/src/components/knowledge/UserPersonaCards'
import type { UserMemoryOverview } from '../../../src/shared/knowledge'

function overview(): UserMemoryOverview {
  return {
    profile: {
      version: 1,
      identity: '树',
      formatPrefs: ['请用中文回复'],
      toolPrefs: [],
      updatedAt: '2026-09-15T00:00:00.000Z',
    },
    habits: [{
      id: 'fact-u1',
      content: '我习惯用 pnpm 而不用 npm',
      habitStrength: 0.7,
      lastSeenAt: '2026-09-14T00:00:00.000Z',
      observationIds: ['obs-u1'],
    }],
    recent: [{
      id: 'ep-1',
      content: '昨天用 pnpm 发布了新版本',
      createdAt: '2026-09-14T00:00:00.000Z',
      expiresAt: '2026-10-14T00:00:00.000Z',
      tags: [],
    }],
    pendingHabitCount: 2,
    generatedAt: '2026-09-15T00:00:00.000Z',
  }
}

describe('User persona cards', () => {
  it('keeps unconfirmed facts outside the confirmed section and renders identity once', () => {
    const value = overview()
    value.habits.push({ id: 'confirmed', content: 'Confirmed preference', confirmed: true, observationIds: ['source'] })
    const markup = renderToStaticMarkup(createElement(UserPersonaCards, { overview: value, onOpenInbox: vi.fn() }))
    const confirmedStart = markup.indexOf('knowledge:persona.habits.title')
    const uncertainStart = markup.indexOf('knowledge:persona.uncertainTitle')
    expect(confirmedStart).toBeGreaterThan(-1)
    expect(uncertainStart).toBeGreaterThan(confirmedStart)
    const confirmed = markup.slice(confirmedStart, uncertainStart)
    expect(confirmed).toContain('Confirmed preference')
    expect(confirmed).not.toContain('我习惯用 pnpm 而不用 npm')
    expect(markup.slice(uncertainStart)).toContain('我习惯用 pnpm 而不用 npm')
    expect(markup.match(/树/g)).toHaveLength(1)
  })
  it('renders profile, habits, and recent with source citations and no workspace', () => {
    const markup = renderToStaticMarkup(createElement(UserPersonaCards, { overview: overview(), onOpenInbox: vi.fn() }))
    expect(markup).toContain('我习惯用 pnpm 而不用 npm')
    expect(markup).toContain('fact-u1 · obs-u1')
    expect(markup).toContain('ep-1')
    expect(markup).toContain('knowledge:persona.profile.title')
    expect(markup).toContain('请用中文回复')
    expect(markup).not.toContain('workspace')
  })

  it('labels succession and surfaces the pending count', () => {
    const next = overview()
    next.habits = [{
      id: 'habit-new',
      content: '请用中文回复',
      succession: 'supersedes habit-old',
      observationIds: [],
    }]
    const markup = renderToStaticMarkup(createElement(UserPersonaCards, { overview: next, onOpenInbox: vi.fn() }))
    expect(markup).toContain('supersedes habit-old')
  })

  it('renders empty states without actions besides the inbox navigation', () => {
    const markup = renderToStaticMarkup(createElement(UserPersonaCards, {
      overview: {
        profile: { version: 1, updatedAt: '2026-09-15T00:00:00.000Z' },
        habits: [],
        recent: [],
        pendingHabitCount: 0,
        generatedAt: '2026-09-15T00:00:00.000Z',
      },
      onOpenInbox: vi.fn(),
    }))
    expect(markup.match(/<button/g)?.length ?? 0).toBe(1)
  })
})
