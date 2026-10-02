// Note: bridge the installed facade's static tool catalog until upstream supports host tools.
// See .agents/notes/2026-10-02-blueprint-conversation-development--3efc89cf.md
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import './patch-agent-tool-pairing.mjs'

const file = join(dirname(fileURLToPath(import.meta.resolve('@janus-agent/agent-core'))), 'main/agent/chat-tools/workspace-chat-tools.js')
const marker = '// JanusX host Note tools'
let source = readFileSync(file, 'utf8')
// Upgrade the first-stage patch in existing installs as well as fresh installs.
const oldNames = "['note.list', 'note.read', 'note.write']"
const names = "['note.list', 'note.read', 'note.write', 'note.focus', 'note.scope']"
if (source.includes(marker) && source.includes(oldNames)) {
  source = source.replace(oldNames, names)
  writeFileSync(file, source)
}
if (!source.includes(marker)) {
  const needle = 'return withManifestDescriptions(tools, options.toolManifests);'
  if (source.split(needle).length !== 2) throw new Error('Agent tool catalog changed; review the Note tools compatibility patch')
  const extension = `${marker}
    const schema = (value) => {
      if (Array.isArray(value.type)) return z.union(value.type.map(type => schema({ ...value, type })));
      if (value.enum) return z.enum(value.enum);
      if (value.type === 'string') return z.string();
      if (value.type === 'null') return z.null();
      if (value.type === 'array') return z.array(schema(value.items));
      if (value.type === 'object') {
        if (!value.properties && value.additionalProperties && typeof value.additionalProperties === 'object') return z.record(schema(value.additionalProperties));
        return z.object(Object.fromEntries(Object.entries(value.properties || {}).map(([key, field]) => [key, (value.required || []).includes(key) ? schema(field) : schema(field).optional()])));
      }
      throw new Error('Unsupported host Note tool schema');
    };
    for (const manifest of options.toolManifests || []) {
      if (!['note.list', 'note.read', 'note.write', 'note.focus', 'note.scope'].includes(manifest.canonicalName)) continue;
      tools[manifest.providerName] = {
        description: manifest.description,
        parameters: schema(manifest.inputSchema).extend({ workspaceId }),
        execute: input => execute(manifest.canonicalName, input),
      };
    }
    ${needle}`
  writeFileSync(file, source.replace(needle, extension))
}
