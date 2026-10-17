import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  rankDocuments,
  searchDocuments,
  DOCUMENT_SEARCH_CAP,
  type DocumentSearchQuery,
} from '@/lib/documents/search';

/**
 * #382 Slice 1: document search runs full-text on the weighted `search_tsv`
 * column, ranks title over description over file name, and falls back to an
 * `ilike` match (trigram-indexed title) when full-text finds nothing.
 */

type Doc = { id: string; title: string; description?: string | null; file_name?: string | null };
type Result = { data: Doc[] | null; error: { message: string } | null; count?: number | null };

/** Records each query the search builds and answers it from `respond`. */
function fakeBuilder(respond: (calls: string[]) => Result) {
  const queries: string[][] = [];
  const build = (): DocumentSearchQuery<Doc> => {
    const calls: string[] = [];
    queries.push(calls);
    const q: DocumentSearchQuery<Doc> = {
      textSearch(column, query, options) {
        calls.push(`textSearch:${column}:${query}:${options.type}:${options.config}`);
        return q;
      },
      or(filters) {
        calls.push(`or:${filters}`);
        return q;
      },
      limit(count) {
        calls.push(`limit:${count}`);
        return q;
      },
      then(onFulfilled, onRejected) {
        return Promise.resolve(respond(calls)).then(onFulfilled, onRejected);
      },
    };
    return q;
  };
  return { build, queries };
}

describe('rankDocuments', () => {
  const docs: Doc[] = [
    { id: 'file', title: 'Scan 01', description: null, file_name: 'invoice-march.pdf' },
    { id: 'desc', title: 'March bundle', description: 'Invoice for estate dues', file_name: 'a.pdf' },
    { id: 'title', title: 'Invoice register', description: null, file_name: 'b.pdf' },
  ];

  it('orders a title match above a description match above a file-name match', () => {
    expect(rankDocuments(docs, 'invoice').map((d) => d.id)).toEqual(['title', 'desc', 'file']);
  });

  it('scores each query word, so a document matching more words ranks higher', () => {
    expect(rankDocuments(docs, 'march invoice').map((d) => d.id)).toEqual(['desc', 'title', 'file']);
  });

  it('matches word prefixes and keeps input order on ties', () => {
    expect(rankDocuments(docs, 'inv').map((d) => d.id)).toEqual(['title', 'desc', 'file']);
    expect(rankDocuments(docs, 'zzz').map((d) => d.id)).toEqual(['file', 'desc', 'title']);
  });

  it('returns the input unchanged for a query with no words', () => {
    expect(rankDocuments(docs, '  !! ')).toBe(docs);
  });
});

describe('searchDocuments', () => {
  it('queries search_tsv with websearch syntax and the english config', async () => {
    const hit = { data: [{ id: '1', title: 'Gate rules' }], error: null };
    const { build, queries } = fakeBuilder(() => hit);

    const result = await searchDocuments(build, 'gate -visitor', ['title']);

    expect(result).toBe(hit);
    expect(queries).toEqual([
      ['textSearch:search_tsv:gate -visitor:websearch:english', `limit:${DOCUMENT_SEARCH_CAP}`],
    ]);
  });

  it('falls back to an escaped ilike on the fallback columns when full-text finds nothing', async () => {
    const fallback = { data: [{ id: '2', title: 'Invoices 2026' }], error: null };
    const { build, queries } = fakeBuilder((calls) =>
      calls[0].startsWith('textSearch') ? { data: [], error: null } : fallback
    );

    const result = await searchDocuments(build, 'inv,x', ['title', 'description'], 25);

    expect(result).toBe(fallback);
    expect(queries[1]).toEqual([
      'or:title.ilike."%inv,x%",description.ilike."%inv,x%"',
      'limit:25',
    ]);
  });

  it('returns a full-text error without trying the fallback', async () => {
    const failed = { data: null, error: { message: 'syntax error in tsquery' } };
    const { build, queries } = fakeBuilder(() => failed);

    expect(await searchDocuments(build, 'gate', ['title'])).toBe(failed);
    expect(queries).toHaveLength(1);
  });

  it('caps the search term at 200 characters', async () => {
    const { build, queries } = fakeBuilder(() => ({ data: [], error: null }));

    await searchDocuments(build, 'a'.repeat(300), ['title']);

    expect(queries[0][0]).toBe(`textSearch:search_tsv:${'a'.repeat(200)}:websearch:english`);
  });
});

describe('documents search_tsv migration (static)', () => {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const sql = readFileSync(
    path.join(root, 'supabase/migrations/20261018090000_documents_search_tsv.sql'),
    'utf8'
  )
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim();

  it('adds a stored generated tsvector weighted A title, B description, C file_name', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS search_tsv tsvector GENERATED ALWAYS AS (');
    expect(sql).toContain("setweight(to_tsvector('english'::regconfig, coalesce(title, '')), 'A')");
    expect(sql).toContain("setweight(to_tsvector('english'::regconfig, coalesce(description, '')), 'B')");
    expect(sql).toContain("setweight(to_tsvector('english'::regconfig, coalesce(file_name, '')), 'C')");
    expect(sql).toContain(') STORED;');
  });

  it('indexes search_tsv with GIN, drops only idx_documents_search, and keeps the trigram index', () => {
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_documents_search_tsv ON public.documents USING gin (search_tsv);');
    expect(sql).toContain('DROP INDEX IF EXISTS public.idx_documents_search;');
    expect(sql.match(/DROP /g)).toHaveLength(1);
    expect(sql).not.toContain('trgm');
  });

  it('adds no table, policy, grant or trigger', () => {
    for (const word of ['CREATE TABLE', 'POLICY', 'GRANT', 'REVOKE', 'TRIGGER']) {
      expect(sql.toUpperCase()).not.toContain(word);
    }
  });
});
