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

The example is opt-in, and is not registered in production. A runnable harness is at `tests/e2e/island-harness/extensions.html`. Third-party imports, credential APIs and the marketplace remain separate stages.

The production file tree, Git and session panels register through this same registry as `janusx.files`, `janusx.git` and `janusx.sessions`; each contributes a right-hand `panel` view. Their definitions and compatibility metadata live in [builtins.tsx](builtins.tsx). The right-tool adapter maps these view IDs to the existing `files`, `git`, and `sessions` keys, preserving saved widths and callers without duplicate tabs. Icons, ordering, localized labels, feature gates and width defaults belong to the definitions. These are trusted, bundled React views with existing host services, not third-party packages.

Built-in metadata registers before right-tool preference hydration. Components load lazily to avoid a metadata/store/component import cycle. These application-scoped shells continue reading the current project/worktree from their existing stores, preserve local UI state across project switches as before, and remain usable without a selected project. Disable removes their entry and open panel; re-enable leaves them closed and retains their width preference. Closing the session view releases its UI subscriptions and leaves host-owned sessions and terminals running. The right container supplies its existing retry/close error boundary for all contributions; workspace views use the workspace error boundary.

Use `extensionRegistry.disable('janusx.git')` / `.enable('janusx.git')` for trusted lifecycle control, or `openExtensionView('extension:janusx.git/panel')` to open through the compatible legacy identity. Session entry points also enforce the existing experimental feature flag. This API does not yet add a plugin-management settings page or persist enabled/disabled state across application launches.

The bundled CPA integration in [cpa.tsx](cpa.tsx) contributes the application-scoped workspace view `extension:janusx.cpa/management`. Settings → Service integrations supports local managed CPA or an existing management-page URL; the pane's `+` menu also opens it. Local CPA downloads official verified backend and frontend assets on first enable, uses a configurable loopback port, and keeps programs, accounts and configuration under the app data directory. Its management key is encrypted with system storage; Copy management key places it on the clipboard for CPA's original login page. External mode stores no management key. Remember password is owned by the frontend.

The local service continues after closing its tab, stops when disabled or JanusX quits, and starts on demand rather than on every application launch. Automatic updates stage in the background and apply on the next CPA start; Update and restart interrupts current connections immediately. Startup failure of a staged version falls back to the previous current installation while preserving accounts and the prior config. Windows children inherit the application's current privilege level; this release does not implement de-elevation. Third-party plugins do not gain executable installation or launch permissions from this integration.

CPA uses a sandboxed native browser surface without a preload or host bridge, with a persistent partition per configured origin. Project switches reuse the guest; closing or disabling releases it while preserving its login storage. HTTP(S) popups stay in that surface, and a system-browser action is available. This is a host-owned external-page integration, not a template granting third-party plugins the browser or credential bridge. Details and compatibility limits belong to [service-integrations.md](../../../../.agents/notes/workbench/service-integrations.md).
