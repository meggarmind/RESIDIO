/**
 * Document taxonomy rules (#382 Slice 2), shared by the server actions and the UI.
 *
 * The database enforces the same rules (migration 20261018140000): the tag depth
 * trigger, the unique assignment pair, and the typed-value check. These copies
 * give the user a clear message before the write, and let the UI offer only
 * valid parents.
 */

import type { DocumentCustomFieldDataType, DocumentCustomFieldValue, DocumentTag } from '@/types/database';

export const MAX_TAG_DEPTH = 5;

type TagNode = Pick<DocumentTag, 'id' | 'parent_tag_id'>;

/** The tag plus every tag nested under it, at any depth. */
export function tagWithDescendants(tags: TagNode[], tagId: string): string[] {
  const result = [tagId];
  for (let i = 0; i < result.length; i++) {
    for (const t of tags) {
      if (t.parent_tag_id === result[i] && !result.includes(t.id)) result.push(t.id);
    }
  }
  return result;
}

/**
 * Why `parentId` cannot be the parent of `tagId` (null for a new tag), or null if it can.
 * Depth is 1 for a root tag; the tag's depth plus the height of its subtree must stay <= 5.
 */
export function tagParentError(tags: TagNode[], tagId: string | null, parentId: string | null): string | null {
  if (!parentId) return null;
  const byId = new Map(tags.map((t) => [t.id, t]));
  if (!byId.has(parentId)) return 'Parent tag not found';

  let ancestors = 0;
  for (let cursor: string | null = parentId; cursor; cursor = byId.get(cursor)?.parent_tag_id ?? null) {
    if (cursor === tagId) return 'A tag cannot be nested under itself or one of its own sub-tags';
    if (++ancestors >= MAX_TAG_DEPTH) return `Tags can be nested at most ${MAX_TAG_DEPTH} levels deep`;
  }

  const height = tagId ? subtreeHeight(tags, tagId) : 1;
  return ancestors + height > MAX_TAG_DEPTH ? `Tags can be nested at most ${MAX_TAG_DEPTH} levels deep` : null;
}

function subtreeHeight(tags: TagNode[], tagId: string, seen = new Set<string>()): number {
  if (seen.has(tagId)) return 0;
  seen.add(tagId);
  const children = tags.filter((t) => t.parent_tag_id === tagId);
  return 1 + Math.max(0, ...children.map((c) => subtreeHeight(tags, c.id, seen)));
}

export const VALUE_COLUMN: Record<DocumentCustomFieldDataType, keyof DocumentCustomFieldValue> = {
  text: 'value_text',
  number: 'value_number',
  date: 'value_date',
  money: 'value_money',
  boolean: 'value_boolean',
  url: 'value_url',
  document_link: 'value_document_id',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TypedValueColumns = Pick<
  DocumentCustomFieldValue,
  'value_text' | 'value_number' | 'value_date' | 'value_money' | 'value_boolean' | 'value_url' | 'value_document_id'
>;

/**
 * Turns a submitted value into the row's typed columns: exactly one is set, the one the field's
 * type names. Returns an error string for a value that does not fit the type.
 */
export function toTypedValueColumns(
  dataType: DocumentCustomFieldDataType,
  raw: unknown
): { columns: TypedValueColumns; error: null } | { columns: null; error: string } {
  const columns: TypedValueColumns = {
    value_text: null,
    value_number: null,
    value_date: null,
    value_money: null,
    value_boolean: null,
    value_url: null,
    value_document_id: null,
  };
  const fail = (error: string) => ({ columns: null, error });
  const text = typeof raw === 'string' ? raw.trim() : raw;

  switch (dataType) {
    case 'text':
      if (typeof text !== 'string' || !text) return fail('Enter some text');
      columns.value_text = text;
      break;
    case 'number':
    case 'money': {
      const n = typeof text === 'number' ? text : typeof text === 'string' && text ? Number(text) : NaN;
      if (!Number.isFinite(n)) return fail('Enter a number');
      // money is numeric(15,2): Postgres rounds to the kobo
      columns[dataType === 'money' ? 'value_money' : 'value_number'] = n;
      break;
    }
    case 'date':
      if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(text))) {
        return fail('Enter a date as YYYY-MM-DD');
      }
      columns.value_date = text;
      break;
    case 'boolean':
      if (typeof raw !== 'boolean') return fail('Choose yes or no');
      columns.value_boolean = raw;
      break;
    case 'url':
      if (typeof text !== 'string' || !/^https?:\/\/\S+$/i.test(text)) return fail('Enter a link starting with http:// or https://');
      columns.value_url = text;
      break;
    case 'document_link':
      if (typeof text !== 'string' || !UUID_RE.test(text)) return fail('Choose a document');
      columns.value_document_id = text;
      break;
    default:
      return fail('Unknown field type');
  }
  return { columns, error: null };
}

/** The stored value of a row, read from the column its field's type names. */
export function readTypedValue(dataType: DocumentCustomFieldDataType, row: TypedValueColumns) {
  return row[VALUE_COLUMN[dataType] as keyof TypedValueColumns];
}

type NamedTag = Pick<DocumentTag, 'id' | 'name' | 'parent_tag_id'>;

/** "Finance / Invoices / 2026": the tag's name after its ancestors', for pickers and filters. */
export function tagPathLabel(tags: NamedTag[], tagId: string): string {
  const byId = new Map(tags.map((t) => [t.id, t]));
  const names: string[] = [];
  for (let t = byId.get(tagId); t && names.length < MAX_TAG_DEPTH; t = t.parent_tag_id ? byId.get(t.parent_tag_id) : undefined) {
    names.unshift(t.name);
  }
  return names.join(' / ');
}
