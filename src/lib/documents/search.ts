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

/** Light english stemmer so "rules"/"Rule" and "policies"/"Policy" compare equal, as Postgres matched them. */
function stemWord(word: string): string {
  const w = word.toLowerCase().replace(/ies$/, 'i').replace(/y$/, 'i');
  const suffix = ['ing', 'es', 'ed', 's'].find((s) => w.endsWith(s) && w.length - s.length >= 3);
  return suffix ? w.slice(0, -suffix.length) : w;
}

const stemmedWords = (text: string) => (text.match(WORD_RE) ?? []).map(stemWord);

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
 * of the best field holding a word that starts with it, both lightly stemmed.
 * Ties keep input order.
 */
export function rankDocuments<T extends RankableDocument>(docs: T[], search: string): T[] {
  const terms = stemmedWords(search);
  if (terms.length === 0) return docs;

  const score = (doc: T) =>
    terms.reduce((total, term) => {
      const best = FIELD_WEIGHTS.reduce((max, [field, weight]) => {
        const words = stemmedWords(doc[field] ?? '');
        return words.some((w) => w.startsWith(term)) ? Math.max(max, weight) : max;
      }, 0);
      return total + best;
    }, 0);

  return docs
    .map((doc, index) => ({ doc, index, score: score(doc) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ doc }) => doc);
}
