import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * #382 Slice 2: document taxonomy (nested tags, typed custom fields).
 * Pure rules and the server actions' gates, with a
 * fake Supabase client. Nothing here connects to a database.
 */

const mocks = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  logAudit: vi.fn(),
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/audit/logger', () => ({
  logAudit: mocks.logAudit,
  getChangedValues: (o: Record<string, unknown>, n: Record<string, unknown>) => ({ old: o, new: n }),
}));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: mocks.createServerSupabaseClient }));

import {
  MAX_TAG_DEPTH,
  tagParentError,
  tagWithDescendants,
  toTypedValueColumns,
  readTypedValue,
  VALUE_COLUMN,
} from '@/lib/documents/taxonomy';
import { createDocumentTag, updateDocumentTag, deleteDocumentTag } from '@/actions/documents/tags';
import {
  createDocumentCustomField,
  updateDocumentCustomField,
  deleteDocumentCustomField,
} from '@/actions/documents/custom-fields';
import { setDocumentTags, setDocumentCustomFieldValue, getDocumentTaxonomy } from '@/actions/documents/document-taxonomy';
import { getDocuments } from '@/actions/documents/get-documents';
import { uploadDocument } from '@/actions/documents/upload-document';
import { DOCUMENT_CUSTOM_FIELD_DATA_TYPES } from '@/types/database';

// ---------------------------------------------------------------------------
// Fake Supabase: every builder call is recorded; `respond` decides the result.
// ---------------------------------------------------------------------------
type Call = {
  table: string;
  op: 'select' | 'insert' | 'update' | 'upsert' | 'delete';
  payload?: unknown;
  options?: unknown;
  filters: [string, string, unknown][];
};
type Result = { data: unknown; error: { message: string } | null; count?: number };

let calls: Call[] = [];
let respond: (call: Call) => Result = () => ({ data: null, error: null });

function fakeClient() {
  const from = (table: string) => {
    const call: Call = { table, op: 'select', filters: [] };
    let recorded = false;
    const record = () => {
      if (!recorded) calls.push(call);
      recorded = true;
    };
    const builder: Record<string, unknown> = {};
    const chain = (name: string) => (...args: unknown[]) => {
      if (['insert', 'update', 'upsert', 'delete'].includes(name)) {
        call.op = name as Call['op'];
        call.payload = args[0];
        call.options = args[1];
      } else if (['eq', 'in', 'is', 'or', 'gte', 'lte'].includes(name)) {
        call.filters.push([name, String(args[0]), args[1]]);
      }
      return builder;
    };
    for (const m of ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'in', 'is', 'or', 'gte', 'lte', 'order', 'range', 'limit', 'textSearch']) {
      builder[m] = chain(m);
    }
    builder.single = builder.maybeSingle = () => {
      record();
      return Promise.resolve(respond(call));
    };
    builder.then = (ok: (r: Result) => unknown, fail: (e: unknown) => unknown) => {
      record();
      return Promise.resolve(respond(call)).then(ok, fail);
    };
    return builder;
  };
  return {
    from,
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    storage: { from: () => ({ upload: async () => ({ error: null }), remove: async () => ({ error: null }) }) },
  };
}

const writes = () => calls.filter((c) => c.op !== 'select');

beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  respond = () => ({ data: null, error: null });
  mocks.authorizePermission.mockResolvedValue({ authorized: true });
  mocks.createServerSupabaseClient.mockImplementation(async () => fakeClient());
});

// A chain a > b > c > d > e (depth 5) plus a separate branch x > y.
const CHAIN = [
  { id: 'a', parent_tag_id: null },
  { id: 'b', parent_tag_id: 'a' },
  { id: 'c', parent_tag_id: 'b' },
  { id: 'd', parent_tag_id: 'c' },
  { id: 'e', parent_tag_id: 'd' },
  { id: 'x', parent_tag_id: null },
  { id: 'y', parent_tag_id: 'x' },
];

const ROOT = '11111111-1111-4111-8111-111111111111';
const VERSION = '22222222-2222-4222-8222-222222222222';
const TAG_1 = '33333333-3333-4333-8333-333333333333';
const TAG_2 = '44444444-4444-4444-8444-444444444444';
const TAG_3 = '55555555-5555-4555-8555-555555555555';
const FIELD = '66666666-6666-4666-8666-666666666666';

// ---------------------------------------------------------------------------
describe('tag nesting rules', () => {
  it('caps nesting at 5 levels', () => {
    expect(MAX_TAG_DEPTH).toBe(5);
    expect(tagParentError(CHAIN, null, 'd')).toBeNull(); // new tag at depth 5
    expect(tagParentError(CHAIN, null, 'e')).toMatch(/at most 5 levels/); // would be depth 6
  });

  it('counts the subtree being moved, not just the tag', () => {
    // x > y has height 2: under c (depth 3) y lands at depth 5, under d at depth 6
    expect(tagParentError(CHAIN, 'x', 'c')).toBeNull();
    expect(tagParentError(CHAIN, 'x', 'd')).toMatch(/at most 5 levels/);
  });

  it('refuses a cycle', () => {
    expect(tagParentError(CHAIN, 'a', 'c')).toMatch(/itself or one of its own sub-tags/);
    expect(tagParentError(CHAIN, 'b', 'b')).toMatch(/itself/);
  });

  it('a parent tag propagates to every nested tag when filtering', () => {
    expect(tagWithDescendants(CHAIN, 'b').sort()).toEqual(['b', 'c', 'd', 'e']);
    expect(tagWithDescendants(CHAIN, 'y')).toEqual(['y']);
  });
});

describe('typed custom-field values', () => {
  const ok = (type: Parameters<typeof toTypedValueColumns>[0], raw: unknown) => {
    const r = toTypedValueColumns(type, raw);
    expect(r.error).toBeNull();
    const set = Object.entries(r.columns ?? {}).filter(([, v]) => v !== null);
    expect(set).toHaveLength(1);
    return set[0];
  };

  it('writes exactly the column its type names', () => {
    expect(ok('text', ' Plot 4 ')).toEqual(['value_text', 'Plot 4']);
    expect(ok('number', '12.5')).toEqual(['value_number', 12.5]);
    expect(ok('money', '1500.25')).toEqual(['value_money', 1500.25]);
    expect(ok('date', '2026-10-18')).toEqual(['value_date', '2026-10-18']);
    expect(ok('boolean', false)).toEqual(['value_boolean', false]);
    expect(ok('url', 'https://example.com/a')).toEqual(['value_url', 'https://example.com/a']);
    expect(ok('document_link', ROOT)).toEqual(['value_document_id', ROOT]);
  });

  it.each([
    ['number', 'abc'],
    ['money', ''],
    ['date', '18/10/2026'],
    ['boolean', 'true'],
    ['url', 'javascript:alert(1)'],
    ['url', 'example.com'],
    ['document_link', 'not-a-uuid'],
    ['text', '   '],
  ] as const)('rejects a %s value of %j', (type, raw) => {
    expect(toTypedValueColumns(type, raw).columns).toBeNull();
  });

  it('maps every data type to its own column and reads it back', () => {
    expect(Object.keys(VALUE_COLUMN).sort()).toEqual([...DOCUMENT_CUSTOM_FIELD_DATA_TYPES].sort());
    expect(new Set(Object.values(VALUE_COLUMN)).size).toBe(DOCUMENT_CUSTOM_FIELD_DATA_TYPES.length);
    const r = toTypedValueColumns('date', '2026-01-02');
    expect(readTypedValue('date', r.columns!)).toBe('2026-01-02');
    expect(readTypedValue('text', r.columns!)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('permission gates', () => {
  const denied = { authorized: false, error: 'Permission denied' };

  it.each([
    ['createDocumentTag', 'documents.manage_tags', () => createDocumentTag({ name: 'Leases' })],
    ['updateDocumentTag', 'documents.manage_tags', () => updateDocumentTag(TAG_1, { name: 'x' })],
    ['deleteDocumentTag', 'documents.manage_tags', () => deleteDocumentTag(TAG_1)],
    ['createDocumentCustomField', 'documents.manage_custom_fields', () => createDocumentCustomField({ name: 'Expiry', data_type: 'date' })],
    ['updateDocumentCustomField', 'documents.manage_custom_fields', () => updateDocumentCustomField(FIELD, { name: 'x' })],
    ['deleteDocumentCustomField', 'documents.manage_custom_fields', () => deleteDocumentCustomField(FIELD)],
    ['setDocumentTags', 'documents.update', () => setDocumentTags(ROOT, [TAG_1])],
    ['setDocumentCustomFieldValue', 'documents.update', () => setDocumentCustomFieldValue(ROOT, FIELD, 'v')],
  ])('%s requires %s and writes nothing without it', async (_name, permission, run) => {
    mocks.authorizePermission.mockResolvedValue(denied);
    const res = (await run()) as { error: string | null };
    expect(mocks.authorizePermission).toHaveBeenCalledWith(permission);
    expect(res.error).toBe('Permission denied');
    expect(calls).toEqual([]);
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('a permitted tag create writes and audits', async () => {
    respond = (c) => (c.op === 'insert' ? { data: { id: TAG_1, name: 'Leases' }, error: null } : { data: null, error: null });
    const res = await createDocumentTag({ name: 'Leases' });
    expect(res.error).toBeNull();
    expect(writes()).toHaveLength(1);
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE', entityType: 'document_tags' }));
  });

  it('createDocumentTag refuses a parent at the depth cap before inserting', async () => {
    const ids = [1, 2, 3, 4, 5].map((n) => `${n}0000000-0000-4000-8000-000000000000`);
    const chain = ids.map((id, i) => ({ id, parent_tag_id: i ? ids[i - 1] : null }));
    respond = (c) =>
      c.op === 'select' ? { data: chain, error: null } : { data: { id: 'new', name: 'fits' }, error: null };

    const tooDeep = await createDocumentTag({ name: 'too deep', parent_tag_id: ids[4] });
    expect(tooDeep.error).toMatch(/at most 5 levels/);
    expect(writes()).toEqual([]);

    const fits = await createDocumentTag({ name: 'fits', parent_tag_id: ids[3] });
    expect(fits.error).toBeNull();
    expect(writes()).toHaveLength(1);
  });

  it('updateDocumentTag refuses a re-parent that pushes the subtree past 5 levels', async () => {
    const tree = [
      { id: TAG_1, parent_tag_id: null },
      { id: 'c', parent_tag_id: TAG_1 },
      { id: 'd', parent_tag_id: 'c' },
      { id: TAG_2, parent_tag_id: 'd' }, // depth 4
      { id: TAG_3, parent_tag_id: null }, // height 2: under TAG_2 its leaf would sit at depth 6
      { id: 'leaf', parent_tag_id: TAG_3 },
    ];
    respond = (c) => (c.table === 'document_tags' && c.op === 'select' ? { data: tree, error: null } : { data: null, error: null });
    const res = await updateDocumentTag(TAG_3, { parent_tag_id: TAG_2 });
    expect(res.error).toMatch(/at most 5 levels/);
    expect(writes()).toEqual([]);
  });

  it('updateDocumentTag rejects columns outside the allowlist', async () => {
    const res = await updateDocumentTag(TAG_1, { created_at: 'x' } as never);
    expect(res.error).toBeTruthy();
    expect(calls).toEqual([]);
  });

  it('updateDocumentCustomField cannot change the data type', async () => {
    const res = await updateDocumentCustomField(FIELD, { data_type: 'number' } as never);
    expect(res.error).toBeTruthy();
    expect(calls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe('per-document taxonomy lives on the root document', () => {
  // VERSION is a version of ROOT
  const documents = (c: Call) => {
    const id = c.filters.find(([op, col]) => op === 'eq' && col === 'id')?.[2];
    if (id === VERSION) return { data: { id: VERSION, title: 'Lease v2', parent_document_id: ROOT }, error: null };
    if (id === ROOT) return { data: { id: ROOT, title: 'Lease', parent_document_id: null }, error: null };
    return { data: null, error: { message: 'no rows' } };
  };

  it('setDocumentTags on a version writes to the root, adding only new tags and removing dropped ones', async () => {
    respond = (c) => {
      if (c.table === 'documents') return documents(c);
      if (c.table === 'document_tag_assignments' && c.op === 'select') {
        return { data: [{ tag_id: TAG_1 }, { tag_id: TAG_2 }], error: null };
      }
      return { data: null, error: null };
    };
    const res = await setDocumentTags(VERSION, [TAG_1, TAG_3, TAG_3]);
    expect(res).toEqual({ success: true, error: null });

    const [insert, del] = writes();
    expect(insert.op).toBe('insert');
    expect(insert.payload).toEqual([{ document_id: ROOT, tag_id: TAG_3 }]); // TAG_1 already assigned
    expect(del.op).toBe('delete');
    expect(del.filters).toEqual([
      ['eq', 'document_id', ROOT],
      ['in', 'tag_id', [TAG_2]],
    ]);
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'document_tag_assignments', entityId: ROOT, newValues: { tag_ids: [TAG_1, TAG_3] } })
    );
  });

  it('getDocumentTaxonomy on a version reads the root, so values survive a version upload', async () => {
    respond = (c) => {
      if (c.table === 'documents') return documents(c);
      if (c.table === 'document_custom_field_values') return { data: [{ field_id: FIELD, value_text: 'kept' }], error: null };
      return { data: [], error: null };
    };
    const res = await getDocumentTaxonomy(VERSION);
    expect(res.data?.root_document_id).toBe(ROOT);
    expect(res.data?.values).toEqual([{ field_id: FIELD, value_text: 'kept' }]);
    const valueRead = calls.find((c) => c.table === 'document_custom_field_values');
    expect(valueRead?.filters).toEqual([['eq', 'document_id', ROOT]]);
  });

  const withField = (dataType: string) => (c: Call): Result => {
    if (c.table === 'documents') return documents(c);
    if (c.table === 'document_custom_fields') {
      return { data: { id: FIELD, name: 'Expiry', data_type: dataType, is_active: true }, error: null };
    }
    if (c.op === 'upsert') return { data: { id: 'v1', ...(c.payload as object) }, error: null };
    return { data: null, error: null };
  };

  it('setDocumentCustomFieldValue upserts the typed column on the root', async () => {
    respond = withField('date');
    const res = await setDocumentCustomFieldValue(VERSION, FIELD, '2027-01-31');
    expect(res.error).toBeNull();
    const [upsert] = writes();
    expect(upsert.op).toBe('upsert');
    expect(upsert.options).toEqual({ onConflict: 'document_id,field_id' });
    expect(upsert.payload).toMatchObject({ document_id: ROOT, field_id: FIELD, value_date: '2027-01-31', value_text: null });
  });

  it('setDocumentCustomFieldValue refuses a value of the wrong type without writing', async () => {
    respond = withField('number');
    const res = await setDocumentCustomFieldValue(ROOT, FIELD, 'twelve');
    expect(res.error).toBe('Enter a number');
    expect(writes()).toEqual([]);
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('setDocumentCustomFieldValue refuses a link to a document the caller cannot see', async () => {
    respond = withField('document_link');
    const res = await setDocumentCustomFieldValue(ROOT, FIELD, TAG_1);
    expect(res.error).toBe('Linked document not found');
    expect(writes()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe('library filter and upload', () => {
  it('filtering by a parent tag matches documents tagged with its children', async () => {
    respond = (c) => {
      if (c.table === 'document_tags') return { data: [{ id: TAG_1, parent_tag_id: null }, { id: TAG_2, parent_tag_id: TAG_1 }], error: null };
      if (c.table === 'document_tag_assignments') return { data: [{ document_id: ROOT }], error: null };
      return {
        data: [{ id: ROOT, resident: null, tag_assignments: [{ tag: { id: TAG_2, name: 'Child', color: '#000000', is_active: true } }, { tag: { id: TAG_3, name: 'Old', color: '#000000', is_active: false } }] }],
        error: null,
        count: 1,
      };
    };
    const res = await getDocuments({ tag_id: TAG_1 });
    const assignmentQuery = calls.find((c) => c.table === 'document_tag_assignments');
    expect(assignmentQuery?.filters).toEqual([['in', 'tag_id', [TAG_1, TAG_2]]]);
    const docQuery = calls.find((c) => c.table === 'documents');
    expect(docQuery?.filters).toContainEqual(['in', 'id', [ROOT]]);
    expect(res.data[0].tags).toEqual([{ id: TAG_2, name: 'Child', color: '#000000' }]); // inactive tag hidden
  });

  it('a tag with no documents returns an empty page without querying documents', async () => {
    respond = (c) => ({ data: c.table === 'document_tags' ? [{ id: TAG_1, parent_tag_id: null }] : [], error: null });
    const res = await getDocuments({ tag_id: TAG_1 });
    expect(res).toEqual({ data: [], count: 0, error: null });
    expect(calls.some((c) => c.table === 'documents')).toBe(false);
  });

  it('uploadDocument assigns the picked tags to the new document', async () => {
    respond = (c) =>
      c.table === 'documents' && c.op === 'insert'
        ? { data: { id: ROOT, title: 'Lease', file_name: 'l.pdf' }, error: null }
        : { data: null, error: null };
    const fd = new FormData();
    fd.set('file', new File(['abc'], 'l.pdf', { type: 'application/pdf' }));
    fd.set('title', 'Lease');
    fd.append('tag_ids', TAG_1);
    fd.append('tag_ids', TAG_1);
    fd.append('tag_ids', TAG_2);
    const res = await uploadDocument(fd);
    expect(res.error).toBeNull();
    expect(mocks.authorizePermission).toHaveBeenCalledWith('documents.upload');
    const tagInsert = calls.find((c) => c.table === 'document_tag_assignments');
    expect(tagInsert?.payload).toEqual([
      { document_id: ROOT, tag_id: TAG_1 },
      { document_id: ROOT, tag_id: TAG_2 },
    ]);
    expect(res.warning).toBeNull();
  });

  it('uploadDocument keeps the document but warns when the tags cannot be assigned', async () => {
    respond = (c) => {
      if (c.table === 'documents' && c.op === 'insert') return { data: { id: ROOT, title: 'Lease', file_name: 'l.pdf' }, error: null };
      if (c.table === 'document_tag_assignments') return { data: null, error: { message: 'violates foreign key constraint' } };
      return { data: null, error: null };
    };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fd = new FormData();
    fd.set('file', new File(['abc'], 'l.pdf', { type: 'application/pdf' }));
    fd.set('title', 'Lease');
    fd.append('tag_ids', TAG_1);
    const res = await uploadDocument(fd);
    expect(res.error).toBeNull();
    expect(res.data?.id).toBe(ROOT);
    expect(res.warning).toMatch(/tags could not be assigned/);
    expect(consoleError).toHaveBeenCalledWith('Document tag assignment error:', expect.objectContaining({ documentId: ROOT }));
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({ newValues: expect.objectContaining({ tag_ids: [] }) }));
    consoleError.mockRestore();
  });
});
