/**
 * PostgREST caps every read at its `max_rows` setting (Supabase default 1000), and returns the
 * capped page as if it were the whole result. Use this for reads that must be complete (bank
 * import processing, money totals). For plain counts prefer `{ count: 'exact', head: true }`.
 */

export const DEFAULT_PAGE_SIZE = 1000;
const MAX_PAGES = 10_000;

type PageResult<T> = PromiseLike<{
  data: T[] | null;
  error: { message: string } | null;
}>;

export type FetchAllRowsResult<T> =
  | { data: T[]; error: null }
  | { data: null; error: string };

/**
 * Pages `fetchPage(from, to)` with inclusive `.range()` bounds until a page comes back empty.
 *
 * Termination is on an empty page, not a short one: if the server's cap is below `pageSize`, a
 * short page does not mean exhausted. The next offset advances by the rows actually returned.
 * The query MUST have a deterministic `.order()` (e.g. by id) or pages can overlap or skip rows.
 * Any page error fails the whole read rather than returning a partial result.
 */
export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PageResult<T>,
  pageSize: number = DEFAULT_PAGE_SIZE
): Promise<FetchAllRowsResult<T>> {
  const all: T[] = [];
  let from = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) return { data: null, error: error.message };
    if (!data || data.length === 0) return { data: all, error: null };
    all.push(...data);
    from += data.length;
  }

  return { data: null, error: 'fetchAllRows exceeded the maximum page count' };
}
