import type { CcSwitchToolId } from '../../../shared/ipc/cc-switch'
import claudeIcon from '@/assets/icons/claude.svg'
import codexIcon from '@/assets/icons/codex.svg'
import opencodeIcon from '@/assets/icons/opencode.svg'
import piIcon from '@/assets/icons/pi.svg'
import janusIcon from '@/assets/icons/janus.svg'

/** 官方品牌图标与注册表工具一一对应；缺失即构建期报错，不允许静默悬空。 */
export const CC_SWITCH_TOOL_ICONS: Record<CcSwitchToolId, string> = {
  claude: claudeIcon,
  codex: codexIcon,
  opencode: opencodeIcon,
  pi: piIcon,
  janus: janusIcon,
}
