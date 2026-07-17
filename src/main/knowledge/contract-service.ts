import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import type { KnowledgeContractsSnapshot } from '../../shared/knowledge'
import type { KnowledgeBootstrapResult } from '../../shared/ipc/knowledge'
export type { KnowledgeBootstrapResult } from '../../shared/ipc/knowledge'
import { knowledgeRootPath } from './constants'
import { getKnowledgeContractsSnapshot, KNOWLEDGE_STORAGE_LAYOUT } from './contracts'

interface ContractFileSpec {
  relativePath: string
  content: string
}

function buildReadme(): string {
  return [
    '# JanusX Knowledge Root',
    '',
    'This global directory is owned by the isolated JanusX knowledge module.',
    '',
    '- `observations/` stores append-only raw observations.',
    '- `observations/active/` holds monthly sharded observation files (`YYYY-MM.jsonl`); new records are written here.',
    '- `observations/archive/` holds gzipped archived monthly shards; archived records remain queryable (the read path gunzips and aggregates them).',
    '- `observations/observations.jsonl` is a legacy flat log kept for backward-compat reads; new writes go to active shards.',
    '- `blobs/` stores gzip-compressed blobs for long observations, content-addressed by sha256.',
    '- `facts/`, `wiki/`, and `graph/` store derived knowledge layers.',
    '- `audit/` records every accepted or rejected mutation.',
    '- `indexes/` stores rebuildable retrieval metadata.',
    '- Workspace provenance is stored inside each record, not in the physical storage path.',
    '',
    'Do not hand-edit generated contract JSON files unless you are intentionally evolving the schema.',
  ].join('\n')
}

function buildFileSpecs(snapshot: KnowledgeContractsSnapshot): ContractFileSpec[] {
  return [
    {
      relativePath: 'meta/schema.json',
      content: `${JSON.stringify(snapshot.schema, null, 2)}\n`,
    },
    {
      relativePath: 'meta/storage-layout.json',
      content: `${JSON.stringify(snapshot.storage, null, 2)}\n`,
    },
    {
      relativePath: 'meta/write-policy.json',
      content: `${JSON.stringify(snapshot.writePolicy, null, 2)}\n`,
    },
    {
      relativePath: 'README.md',
      content: `${buildReadme()}\n`,
    },
    {
      relativePath: 'observations/observations.jsonl',
      content: '',
    },
    {
      relativePath: 'facts/candidates.jsonl',
      content: '',
    },
    {
      relativePath: 'facts/facts.jsonl',
      content: '',
    },
    {
      relativePath: 'wiki/pages-index.json',
      content: `${JSON.stringify({ version: 1, pages: [] }, null, 2)}\n`,
    },
    {
      relativePath: 'graph/candidates.jsonl',
      content: '',
    },
    {
      relativePath: 'graph/edges.jsonl',
      content: '',
    },
    {
      relativePath: 'audit/audit.jsonl',
      content: '',
    },
    {
      relativePath: 'indexes/bm25.json',
      content: `${JSON.stringify({ version: 1, documents: 0, terms: {} }, null, 2)}\n`,
    },
    {
      relativePath: 'indexes/graph-snapshot.json',
      content: `${JSON.stringify({ version: 1, nodes: [], edges: [] }, null, 2)}\n`,
    },
  ]
}

async function ensureFile(filePath: string, content: string): Promise<boolean> {
  try {
    await readFile(filePath, 'utf8')
    return false
  } catch {
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, content, 'utf8')
    return true
  }
}

export class KnowledgeContractService {
  getContracts(): KnowledgeContractsSnapshot {
    return getKnowledgeContractsSnapshot()
  }

  async bootstrapWorkspace(workspacePath?: string): Promise<KnowledgeBootstrapResult> {
    const snapshot = getKnowledgeContractsSnapshot()
    const root = knowledgeRootPath()
    const createdDirectories: string[] = []
    const createdFiles: string[] = []

    for (const dir of KNOWLEDGE_STORAGE_LAYOUT.directories) {
      const absolutePath = join(root, dir.relativePath)
      await mkdir(absolutePath, { recursive: true })
      createdDirectories.push(absolutePath)
    }

    for (const file of buildFileSpecs(snapshot)) {
      const absolutePath = join(root, file.relativePath)
      const created = await ensureFile(absolutePath, file.content)
      if (created) createdFiles.push(absolutePath)
    }

    return {
      workspacePath,
      knowledgeRoot: root,
      createdDirectories,
      createdFiles,
      contracts: snapshot,
    }
  }
}

export const knowledgeContractService = new KnowledgeContractService()
