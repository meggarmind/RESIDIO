/**
 * Document full-text search (#382 Slice 1).
 *
 * `documents.search_tsv` is a stored tsvector weighted A title, B description,
 * C file_name (migration 20261018090000). PostgREST can filter on it but cannot
 * order by `ts_rank`, so matches are fetched up to a cap and ranked here with
 * the same field weights.
 */

import { ilikeAny, MAX_SEARCH_TERM_LENGTH } from '@/lib/postgrest-filter';

/** shortcut: ranking happens in the app over at most this many matches; move to an RPC ordering by ts_rank if a library outgrows it. */
export const DOCUMENT_SEARCH_CAP = 500;

// Postgres' default ts_rank weights for A, B and C.
const FIELD_WEIGHTS = [
  ['title', 1],
  ['description', 0.4],
  ['file_name', 0.2],
] as const;

const WORD_RE = /[\p{L}\p{N}]+/gu;

type SearchResult<R> = { data: R[] | null; error: { message: string } | null; count?: number | null };

/** The slice of a PostgREST builder the search needs. */
export interface DocumentSearchQuery<R> extends PromiseLike<SearchResult<R>> {
  textSearch(
    column: string,
    query: string,
    options: { type: 'websearch'; config: string }
  ): DocumentSearchQuery<R>;
  or(filters: string): DocumentSearchQuery<R>;
  limit(count: number): DocumentSearchQuery<R>;
}

/**
 * Full-text match on `search_tsv`; when that finds nothing, fall back to
 * `ilike` on `fallbackColumns` (title is trigram-indexed) so partial words
 * still match. `build` must return a fresh query with all other filters applied.
 */
export async function searchDocuments<R>(
  build: () => DocumentSearchQuery<R>,
  search: string,
  fallbackColumns: string[],
  cap = DOCUMENT_SEARCH_CAP
): Promise<SearchResult<R>> {
  const term = search.slice(0, MAX_SEARCH_TERM_LENGTH);
  const fts = await build()
    .textSearch('search_tsv', term, { type: 'websearch', config: 'english' })
    .limit(cap);
  if (fts.error || (fts.data?.length ?? 0) > 0) return fts;
  return build().or(ilikeAny(fallbackColumns, term)).limit(cap);
}

type RankableDocument = {
  title: string;
  description?: string | null;
  file_name?: string | null;
};

/**
 * Order documents by relevance to `search`: each query word scores the weight
 * of the best field holding a word that starts with it, or (3+ letters) that it
 * starts with, so stemmed matches like "rules" / "Rule" still score. Ties keep
 * input order.
 */
export function rankDocuments<T extends RankableDocument>(docs: T[], search: string): T[] {
  const terms = search.toLowerCase().match(WORD_RE) ?? [];
  if (terms.length === 0) return docs;

  const score = (doc: T) =>
    terms.reduce((total, term) => {
      const best = FIELD_WEIGHTS.reduce((max, [field, weight]) => {
        const words = (doc[field] ?? '').toLowerCase().match(WORD_RE) ?? [];
        return words.some((w) => w.startsWith(term) || (w.length >= 3 && term.startsWith(w)))
          ? Math.max(max, weight)
          : max;
      }, 0);
      return total + best;
    }, 0);

  return docs
    .map((doc, index) => ({ doc, index, score: score(doc) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ doc }) => doc);
}
