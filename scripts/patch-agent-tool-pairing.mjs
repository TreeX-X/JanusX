// Note: preserve call/result pairing and provider turn grouping — see .agents/notes/2026-09-25-blueprint-dialog-separation--2ec6c79b.md
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const file = join(dirname(fileURLToPath(import.meta.resolve('@janus-agent/agent-core'))), 'main/agent/loop/janus-agent-loop.js')
const source = readFileSync(file, 'utf8')
const marker = '// JanusX parallel steering pairing'
if (!source.includes(marker)) {
  const needle = 'let steeredMidTurn = drainSteering();'
  if (source.split(needle).length !== 2) throw new Error('Agent loop changed; review the tool pairing compatibility patch')
  writeFileSync(file, source.replace(needle, `${needle}
            ${marker}
            if (steeredMidTurn) {
                for (const skipped of sequentialCalls) {
                    const result = { content: 'Tool call skipped: superseded by a steered follow-up message.', isError: true };
                    emit({ type: 'tool_execution_end', call: skipped, result, isError: true });
                    terminateFlags.push(false);
                    toolResults.push(toolMessage(skipped, result));
                }
            }`))
}

const streamFile = join(dirname(file), 'vercel-stream-adapter.js')
const streamSource = readFileSync(streamFile, 'utf8')
const streamMarker = '// JanusX group adjacent tool results into one provider turn'
if (!streamSource.includes(streamMarker)) {
  const needle = 'export function toVercelMessages(messages) {'
  if (streamSource.split(needle).length !== 2) throw new Error('Agent stream adapter changed; review the tool result grouping patch')
  writeFileSync(streamFile, streamSource.replace(needle, `${streamMarker}
export function toVercelMessages(messages) {
    const grouped = [];
    for (const message of ungroupedVercelMessages(messages)) {
        const previous = grouped.at(-1);
        if (message.role === 'tool' && previous?.role === 'tool') previous.content.push(...message.content);
        else grouped.push(message);
    }
    return grouped;
}
function ungroupedVercelMessages(messages) {`))
}
