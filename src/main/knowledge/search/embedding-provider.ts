/**
 * @file EmbeddingProvider reservation (Phase 3, §8 stage two).
 * @description Interface-only seam for an optional vector backend. No
 *              implementation ships in Phase 3: `resolveEmbeddingProvider`
 *              always yields `null`, and recall unconditionally uses the BM25
 *              path. A future provider plugs in by returning a non-null
 *              `EmbeddingProvider` here plus a hybrid ranker in recall-service,
 *              with BM25 kept as the keyless fallback when embeddings are
 *              unavailable or fail.
 */

export interface EmbeddingVector {
  /** Stable document key (same key recall-service uses for BM25 docs). */
  id: string
  values: number[]
}

export interface EmbeddingProvider {
  /** Stable provider id for diagnostics / score explanation (e.g. 'openai-ada'). */
  readonly id: string
  /** Vector dimension; rankers may use it to reject mismatched indexes. */
  readonly dimension: number
  /** Embeds corpus texts; order of results matches input order. */
  embedDocuments(texts: string[]): Promise<EmbeddingVector[]>
  /** Embeds a single query string. */
  embedQuery(query: string): Promise<number[]>
  /** Cosine (or provider-native) similarity in [0, 1]; higher is better. */
  similarity(queryVector: number[], documentVector: number[]): number
}

/** Phase 3: no vector backend ships — always resolves to null (BM25 fallback). */
export async function resolveEmbeddingProvider(): Promise<EmbeddingProvider | null> {
  return null
}

/** Type-guard for future wiring: true when a usable provider is configured. */
export function hasEmbeddingProvider(provider: EmbeddingProvider | null): provider is EmbeddingProvider {
  return provider !== null && provider.dimension > 0
}
