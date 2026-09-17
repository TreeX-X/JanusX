import { describe, expect, it } from 'vitest'
import {
  CC_SWITCH_TOOL_META,
  CC_SWITCH_TOOL_ORDER,
} from '../../../src/shared/ipc/cc-switch'
import { CC_SWITCH_TOOLS, getCcSwitchTool } from '../../../src/main/cc-switch/tool-registry'

describe('cc-switch tool registry', () => {
  it('keeps order, descriptors, and display metadata on the same id set', () => {
    expect([...CC_SWITCH_TOOL_ORDER].sort()).toEqual(Object.keys(CC_SWITCH_TOOLS).sort())
    expect([...CC_SWITCH_TOOL_ORDER].sort()).toEqual(Object.keys(CC_SWITCH_TOOL_META).sort())
    for (const id of CC_SWITCH_TOOL_ORDER) {
      const tool = getCcSwitchTool(id)
      expect(tool?.displayName).toBe(CC_SWITCH_TOOL_META[id]?.displayName)
      // npm 分发走包名校验；自有源码走 localLifecycle 声明，二者必居其一。
      if (tool?.latestStrategy === 'npm-dist-tags') {
        expect(tool.npmPackage).toMatch(/^(@[^/]+\/[^/]+|[^/]+)$/)
      } else {
        expect(tool?.localLifecycle?.packageName).toMatch(/^@[^/]+\/[^/]+$/)
      }
    }
  })

  it('rejects unknown ids at the IPC boundary', () => {
    expect(getCcSwitchTool('shell')).toBeUndefined()
    expect(getCcSwitchTool('')).toBeUndefined()
  })
})
