import type { KnowledgeSearchIndexStats } from '../../../shared/knowledge'
import { tokenize, uniqueTerms } from './tokenizer'

export interface Bm25Document {
  id: string
  text: string
}

interface IndexedDocument {
  id: string
  length: number
  termFrequency: Map<string, number>
}

export interface Bm25Hit {
  id: string
  score: number
}

const K1 = 1.5
const B = 0.75

export class Bm25Index {
  private readonly documents: IndexedDocument[]
  private readonly documentFrequency = new Map<string, number>()
  private readonly averageDocumentLength: number

  constructor(documents: Bm25Document[]) {
    this.documents = documents.map((document) => {
      const tokens = tokenize(document.text)
      const termFrequency = new Map<string, number>()
      for (const token of tokens) {
        termFrequency.set(token, (termFrequency.get(token) ?? 0) + 1)
      }

      for (const term of uniqueTerms(tokens)) {
        this.documentFrequency.set(term, (this.documentFrequency.get(term) ?? 0) + 1)
      }

      return {
        id: document.id,
        length: tokens.length,
        termFrequency,
      }
    })

    const totalLength = this.documents.reduce((sum, document) => sum + document.length, 0)
    this.averageDocumentLength = this.documents.length > 0 ? totalLength / this.documents.length : 0
  }

  search(query: string): Bm25Hit[] {
    const queryTerms = uniqueTerms(tokenize(query))
    if (queryTerms.length === 0 || this.documents.length === 0) return []

    const hits: Bm25Hit[] = []
    for (const document of this.documents) {
      let score = 0
      for (const term of queryTerms) {
        const tf = document.termFrequency.get(term) ?? 0
        if (tf === 0) continue

        const df = this.documentFrequency.get(term) ?? 0
        const idf = Math.log(1 + (this.documents.length - df + 0.5) / (df + 0.5))
        const lengthNorm =
          this.averageDocumentLength > 0
            ? 1 - B + B * (document.length / this.averageDocumentLength)
            : 1
        score += idf * ((tf * (K1 + 1)) / (tf + K1 * lengthNorm))
      }

      if (score > 0) hits.push({ id: document.id, score })
    }

    return hits.sort((left, right) => right.score - left.score)
  }

  stats(): KnowledgeSearchIndexStats {
    return {
      documentCount: this.documents.length,
      termCount: this.documentFrequency.size,
      averageDocumentLength: Number(this.averageDocumentLength.toFixed(2)),
    }
  }
}
