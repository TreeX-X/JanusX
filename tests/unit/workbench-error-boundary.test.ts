import { describe, expect, it } from 'vitest'
import { retryWorkbenchErrorBoundary } from '../../src/renderer/src/components/WorkbenchErrorBoundary'

describe('workbench error boundary', () => {
  it('clears the failure and advances the remount key without touching terminal state', () => {
    expect(retryWorkbenchErrorBoundary({ failed: true, retryKey: 3 })).toEqual({
      failed: false,
      retryKey: 4,
    })
  })
})
