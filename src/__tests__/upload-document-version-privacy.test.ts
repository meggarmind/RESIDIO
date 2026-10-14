import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  logAudit: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  documentInsert: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: mocks.logAudit }));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}));

import { uploadDocumentVersion } from '@/actions/documents/upload-document';

const PARENT_ID = '11111111-1111-4111-8111-111111111111';

type Parent = { resident_id: string | null; house_id: string | null };

function buildClient(parent: Parent | null) {
  const parentRow = parent && {
    id: PARENT_ID,
    title: 'Lease',
    description: 'd',
    category_id: 'cat-1',
    ...parent,
  };
  mocks.documentInsert.mockImplementation((payload: Record<string, unknown>) => ({
    select: () => ({
      single: async () => ({
        data: { id: 'new-1', title: payload.title, file_name: payload.file_name, file_size_bytes: 3 },
        error: null,
      }),
    }),
  }));
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: (table: string) => {
      if (table === 'document_access_logs') return { insert: async () => ({ error: null }) };
      return {
        // parent lookup: select('*').eq().single()
        // version lookup: select('version').or().order().limit()
        select: () => ({
          eq: () => ({
            single: async () =>
              parentRow
                ? { data: parentRow, error: null }
                : { data: null, error: { message: 'no rows' } },
          }),
          or: () => ({
            order: () => ({ limit: async () => ({ data: [{ version: 1 }], error: null }) }),
          }),
        }),
        insert: mocks.documentInsert,
      };
    },
    storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove }) },
  };
}

function formWithFile() {
  const fd = new FormData();
  fd.set('file', new File(['abc'], 'v2.pdf', { type: 'application/pdf' }));
  return fd;
}

async function runWithParent(parent: Parent | null) {
  mocks.createServerSupabaseClient.mockImplementation(async () => buildClient(parent));
  return uploadDocumentVersion(PARENT_ID, formWithFile());
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorizePermission.mockResolvedValue({ authorized: true });
  mocks.upload.mockResolvedValue({ error: null });
});

describe('uploadDocumentVersion keeps the parent privacy (#553)', () => {
  it('carries resident_id and a null house_id', async () => {
    const res = await runWithParent({ resident_id: 'res-1', house_id: null });
    expect(res.error).toBeNull();
    const payload = mocks.documentInsert.mock.calls[0][0];
    expect(payload.resident_id).toBe('res-1');
    expect(payload.house_id).toBeNull();
  });

  it('carries house_id and a null resident_id', async () => {
    const res = await runWithParent({ resident_id: null, house_id: 'house-1' });
    expect(res.error).toBeNull();
    const payload = mocks.documentInsert.mock.calls[0][0];
    expect(payload.house_id).toBe('house-1');
    expect(payload.resident_id).toBeNull();
  });

  it('keeps a public parent public (both null)', async () => {
    const res = await runWithParent({ resident_id: null, house_id: null });
    expect(res.error).toBeNull();
    const payload = mocks.documentInsert.mock.calls[0][0];
    expect(payload).toHaveProperty('resident_id', null);
    expect(payload).toHaveProperty('house_id', null);
  });

  it('does not upload or insert when the parent is not readable', async () => {
    const res = await runWithParent(null);
    expect(res).toEqual({ data: null, error: 'Parent document not found' });
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.documentInsert).not.toHaveBeenCalled();
  });
});
