import { describe, expect, it } from 'vitest'
import { splitMaintenanceReply } from '../../src/renderer/src/components/blueprint/BlueprintMaintenancePanel'

describe('Blueprint maintenance reply presentation', () => {
  it('keeps short replies fully visible', () => {
    expect(splitMaintenanceReply('Short answer.')).toEqual({ summary: 'Short answer.', details: null })
  })

  it('uses the first paragraph as the summary and folds the rest', () => {
    expect(splitMaintenanceReply('Summary paragraph.\n\nDetailed explanation.\nMore detail.')).toEqual({
      summary: 'Summary paragraph.',
      details: 'Detailed explanation.\nMore detail.',
    })
  })

  it('folds a long single paragraph without losing content', () => {
    const content = `This is the summary sentence. ${'Detailed content '.repeat(24)}`.trim()
    const result = splitMaintenanceReply(content)
    expect(result.details).not.toBeNull()
    expect(`${result.summary}${result.details ? ` ${result.details}` : ''}`).toBe(content)
  })
})
