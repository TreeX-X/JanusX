# Bundled OfficeCLI

Place the pinned Windows binary here before packaging:

- `resources/officecli/officecli.exe` (`1.0.135`, arch matches the build target)

`electron-builder.yml` copies this directory to `<resources>/officecli`.
The main process resolves it via `resolveBundledOfficecliBinary()` and never
downloads, installs, or prompts for OfficeCLI at runtime.
