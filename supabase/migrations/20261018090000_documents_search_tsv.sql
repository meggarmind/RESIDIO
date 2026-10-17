-- Migration: real full-text search for documents (#382 Slice 1)
-- Purpose: replace the ilike document search with a weighted, ranked tsvector.
--   search_tsv  stored generated column: title (weight A), description (B), file_name (C)
--   idx_documents_search_tsv  GIN index the app queries via websearch_to_tsquery
-- Retires idx_documents_search (20251228100000 line 65): an expression index nothing ever queried.
-- Keeps idx_documents_title_trgm (20260121000000): the prefix/substring fallback when a query has no
-- full-text hit, e.g. a partial word such as "inv".
--
-- Slice 3 extends the column in one statement (Postgres 17, which both Stage and Prod run), and the
-- index is rebuilt with it:
--   ALTER TABLE public.documents ALTER COLUMN search_tsv SET EXPRESSION AS (
--     <the three setweight terms below> ||
--     setweight(to_tsvector('english'::regconfig, coalesce(ocr_text, '')), 'D'));
--
-- No new table, no permission, no RLS change.
-- Rollback:
--   DROP INDEX IF EXISTS public.idx_documents_search_tsv;
--   ALTER TABLE public.documents DROP COLUMN IF EXISTS search_tsv;
--   CREATE INDEX idx_documents_search ON public.documents
--     USING gin(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '')));

ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english'::regconfig, coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english'::regconfig, coalesce(description, '')), 'B') ||
    setweight(to_tsvector('english'::regconfig, coalesce(file_name, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_documents_search_tsv ON public.documents USING gin (search_tsv);

DROP INDEX IF EXISTS public.idx_documents_search;
