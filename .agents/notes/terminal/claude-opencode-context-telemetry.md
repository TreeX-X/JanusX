---
{
  "schema": "harness-note/2",
  "id": "042a600f-8720-5799-827f-53eaa6343faf",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-14",
  "class": "bug-fix",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-14-agent-note-claude-opencode-bottom-context-telemetry-counts-again--042a600f.md",
      "sourceHash": "cb49b0020d77a6d837d97924ce9230b1390ce1b693352e46a0f5ed4d036473fe",
      "originalBodyHash": "f3f9693b85455b25a01e98621d52ef4e2cc62fdb8a5dea03b70e56dbfd0bbc07",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Claude/Opencode bottom context telemetry counts again. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix","Removed lifecycle duplicated by frontmatter"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/bug-fix/2026-09-14-claude-opencode-context-telemetry.md",
        "sourceHash": "cb49b0020d77a6d837d97924ce9230b1390ce1b693352e46a0f5ed4d036473fe",
        "originalBodyHash": "f3f9693b85455b25a01e98621d52ef4e2cc62fdb8a5dea03b70e56dbfd0bbc07"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/bdd26e4e-8207-4c1f-8ea3-21f450ee7570"
}
---
# Claude/Opencode bottom context telemetry counts again


## Problem

Claude and Opencode terminals show no model or context data in the bottom runtime strip and drawer: the usage label stays at the unknown state and never counts. Two independent gaps in `src/main/runtime-telemetry/history.ts` produce the same symptom. Opencode persists its session directory with forward slashes (`C:/repo`) while JanusX terminals report Windows backslash cwds (`C:\repo`), and the directory gate compares the raw spellings, so every bound Opencode session read returns null and no usage ever reaches the renderer. Claude proxy-managed installs carry no top-level `model` in `~/.claude/settings.json` and no `ANTHROPIC_MODEL`, only `ANTHROPIC_DEFAULT_SONNET/OPUS/HAIKU_MODEL`, so the pre-binding bootstrap returns null and the strip has nothing to show until the first hook-bound history read lands.

## Decision

The shared `normalizePath` unifies backslashes to forward slashes before stripping trailing separators, so the exact-session directory gate in Opencode, Codex, and Pi history reads compares canonical spellings on Windows while POSIX behavior stays identical. The Claude bootstrap falls back through `ANTHROPIC_DEFAULT_SONNET_MODEL`, `ANTHROPIC_DEFAULT_OPUS_MODEL`, and `ANTHROPIC_DEFAULT_HAIKU_MODEL` after the existing `model` and `ANTHROPIC_MODEL` lookups, and the declared 200k Claude window still applies, so proxy installs render a model and a zero baseline before any conversation. Secrets handling is unchanged: the bootstrap still serializes only the model name and never the auth token.

## Alternatives considered

- Relax the never-infer-from-shared-cwd guard and scan Opencode/Claude history by cwd without an exact session — strongest case is telemetry without any hook dependency. The driver that rules it out is cross-terminal contamination: two JanusX terminals routinely share one workspace, and only the hook-bound session id keeps their usage separate.
- Normalize inside each call site instead of the shared helper — strongest case is a smaller blast radius limited to Opencode. The driver that rules it out is drift: Codex and Pi share the same gate and the same Windows mismatch, so the single helper keeps one spelling rule for every engine.
- Read additional proxy keys such as `ANTHROPIC_DEFAULT_FABLE_MODEL` or `CLAUDE_CODE_SUBAGENT_MODEL` — strongest case is covering every observed env shape. The driver that rules it out is scope: the canonical Sonnet/Opus/Haiku trio covers the declared-capacity fallback, and vendor-specific variants can extend the same three-line chain when one is observed in the wild.
- Do nothing / reuse — staying put keeps byte-identical comparisons and two bootstrap keys. The cost is permanent blindness on Windows Opencode history plus a null bootstrap for every proxy-managed Claude install, which is exactly the reported missing strip.

## Consequences

- **Gains**: Bound Opencode sessions resolve their `opencode.db` row across slash spellings and report current context plus cumulative usage with authoritative confidence; proxy-managed Claude installs show the declared model and window before the first turn. Coverage: `tests/unit/runtime-telemetry-history.test.ts` gains a forward-slash directory match and a proxy-env bootstrap case, 15 tests in file pass, and the surrounding telemetry plus hook suites (66 tests total) stay green with `tsc --noEmit` clean.
- **Costs and limits**: Path comparison stays case-insensitive on all platforms, which over-matches only on case-sensitive filesystems where two real sibling directories differ by case alone; no such layout is observed in session stores. Stale hook installs still need one terminal recreation to reinstall, so already-running terminals pick up counting on their next session, not retroactively.
