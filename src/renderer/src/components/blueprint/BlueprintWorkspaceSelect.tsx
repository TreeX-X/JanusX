import { useBlueprintStore } from '@/stores/blueprint'
import { useWorkspaceStore } from '@/stores/workspace'
import { useI18n } from '@/i18n/useI18n'
import { Select } from '../ui/Select'

export function BlueprintWorkspaceSelect({ className, getPortalContainer, beforeSwitch }: {
  className?: string
  getPortalContainer?: () => HTMLElement | null
  beforeSwitch?: () => Promise<boolean | undefined>
}) {
  const { t } = useI18n('blueprint')
  const workspaces = useWorkspaceStore(state => state.workspaces)
  const activeId = useWorkspaceStore(state => state.activeWorkspaceId)
  const states = useBlueprintStore(state => state.workspaceStates)
  const switchWorkspace = useBlueprintStore(state => state.switchWorkspace)
  return <Select value={activeId ?? ''} ariaLabel={t('workspace.select')} placeholder={t('workspace.noWorkspace')}
    disabled={!workspaces.length} className={className} getPortalContainer={getPortalContainer}
    options={workspaces.map(workspace => ({ value: workspace.id,
      label: `${workspace.name} · ${t(`workspace.state.${states[workspace.id]?.state ?? 'loading'}`)}${workspace.id === activeId ? ` · ${t('workspace.current')}` : ''}` }))}
    onChange={id => { void (async () => {
      if (id === activeId || await beforeSwitch?.() === false) return
      await switchWorkspace(id)
    })() }} />
}
