# Trusted workbench extensions

S1 provides an in-code renderer API for workspace tabs and right-hand panels. It does not load downloaded code or provide the later third-party sandbox. See [.agents/notes/workbench/requirements/plugin-architecture-forms.md](../../../../.agents/notes/workbench/requirements/plugin-architecture-forms.md).

Register a definition once in the workbench's startup code, outside React rendering:

```tsx
import { extensionRegistry, openExtensionView, type ExtensionViewProps } from '@/extensions'

function Overview({ active, workspacePath }: ExtensionViewProps) {
  return <div style={{ color: 'var(--shell-text)', background: 'var(--shell-canvas)' }}>
    {active && workspacePath}
  </div>
}

const unregister = extensionRegistry.register({
  id: 'team.example',
  views: [
    { id: 'page', title: 'Example page', location: 'workspace', scope: 'project', component: Overview },
    { id: 'summary', title: 'Example summary', location: 'right', scope: 'project', component: Overview },
  ],
  activate: () => {
    // Set up extension-owned resources here. Return their cleanup function.
    return () => {}
  },
})

openExtensionView('extension:team.example/page')
extensionRegistry.disable('team.example')
extensionRegistry.enable('team.example')
unregister()
```

Names use lowercase letters, digits, dots and hyphens and start with a letter. View IDs are unique within an extension. Duplicate registrations and invalid view metadata fail before activation. Activation is synchronous and runs once per enable; cleanup runs once per disable/unregister. A disabled definition remains registered until its returned disposer is called. An activation error must clean any partially acquired resources inside the activation function.

Right-hand contributions appear automatically in the tool rail. Workspace contributions appear in the existing pane's `+` menu and can also be opened with `openExtensionView`. Opening a view is idempotent. With no pane open, trusted startup code or another extension action can open a workspace view to create the first pane. Project contributions require a selected project.

`application` views receive null project context and reuse one identity across project switches. Open application tabs transfer to the new project instead of remaining in inactive project snapshots. Their React component can remount during transfer: durable business state belongs in extension-owned state, as in [examples/workspace-tools.tsx](examples/workspace-tools.tsx). Project workspace tabs restore within their project; project right-hand views remount on project changes to prevent local state leakage. Both positions inherit host CSS theme tokens. Titles are supplied by the extension; localized titles require registration to follow the extension's locale lifecycle.

Open but inactive views remain mounted and receive `active: false`, allowing the extension to pause its work. Closing a view unmounts its component. Disabling or unregistering removes its views from the active tree, inactive snapshots and right-hand open set. Unknown extension tabs are dropped during snapshot reconciliation; right-hand preferences continue the existing rail-only startup policy. Layout snapshots are kept by the existing in-memory workspace store; this API does not introduce disk persistence for workspace tabs.

The example is opt-in, and is not registered in production. A runnable harness is at `tests/e2e/island-harness/extensions.html`. File/Git/session content still uses the existing built-in host pending S2. External service embedding, credential access, third-party imports and the marketplace are separate stages.
