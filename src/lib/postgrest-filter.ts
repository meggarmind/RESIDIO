/**
 * Safe builders for PostgREST `.or()` / filter strings (issue #468).
 *
 * `.or('a.ilike.%x%,b.eq.y')` is parsed by PostgREST: `,` separates clauses,
 * `(` `)` open logic groups, `.` separates column/operator/value, `:` casts, and
 * `*` is a wildcard. Interpolating user text lets a crafted value add or change
 * clauses (`a,id.neq.0`, `x),or(y`). PostgREST's documented remedy is to wrap
 * the value in double quotes, inside which only `\` and `"` are special.
 *
 * Column names passed to these helpers must be code constants, never user input.
 */

import { sanitizeSearchInput } from '@/lib/utils';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLUMN_RE = /^[a-z_][a-z0-9_]*$/i;

/** Max characters of user search text that reach a filter. */
export const MAX_SEARCH_TERM_LENGTH = 200;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

function assertColumn(column: string): void {
  if (!COLUMN_RE.test(column)) {
    throw new Error(`Invalid filter column: ${column}`);
  }
}

/**
 * Wrap a raw value as a PostgREST double-quoted literal. Commas, parentheses,
 * dots, colons, asterisks and single quotes are literal inside it; only `\` and
 * `"` are escaped. NUL and other control characters are dropped.
 */
export function quotePostgrestValue(raw: string): string {
  const cleaned = String(raw ?? '').replace(/[\u0000-\u001f\u007f]/g, '');
  return `"${cleaned.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** `column.ilike."%term%"` with LIKE wildcards in the term escaped. */
export function ilikeContains(column: string, term: string): string {
  assertColumn(column);
  const trimmed = String(term ?? '').slice(0, MAX_SEARCH_TERM_LENGTH);
  return `${column}.ilike.${quotePostgrestValue(`%${sanitizeSearchInput(trimmed)}%`)}`;
}

/** OR of `ilike %term%` across columns, ready for `.or()`. */
export function ilikeAny(columns: string[], term: string): string {
  return columns.map((c) => ilikeContains(c, term)).join(',');
}

/** `column.eq."value"` */
export function eqValue(column: string, value: string): string {
  assertColumn(column);
  return `${column}.eq.${quotePostgrestValue(value)}`;
}

/**
 * `idColumn.eq.<id>,parentColumn.eq.<id>` for "this row or its children".
 * Returns null when `id` is not a UUID so callers can fail before querying.
 */
export function idOrParentFilter(
  idColumn: string,
  parentColumn: string,
  id: string
): string | null {
  if (!isUuid(id)) return null;
  assertColumn(idColumn);
  assertColumn(parentColumn);
  return `${idColumn}.eq.${id},${parentColumn}.eq.${id}`;
}

/**
 * Like {@link idOrParentFilter} but throws on a non-UUID. For call sites where
 * the id was already read back from the database, so a non-UUID is an
 * impossible state rather than bad user input.
 */
export function idOrParentFilterStrict(
  idColumn: string,
  parentColumn: string,
  id: string
): string {
  const filter = idOrParentFilter(idColumn, parentColumn, id);
  if (filter === null) throw new Error('Invalid id for version-chain filter');
  return filter;
}
