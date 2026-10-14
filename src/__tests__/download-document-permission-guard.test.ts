import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PERMISSIONS } from '@/lib/auth/action-roles';

const mocks = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  createSignedUrl: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}));

import {
  getDocumentDownloadUrl,
  getDocumentViewUrl,
  getDocumentDownloadUrls,
} from '@/actions/documents/download-document';

function buildClient() {
  const single = vi.fn().mockResolvedValue({
    data: { id: 'doc-1', file_path: 'a/b.pdf', file_name: 'b.pdf' },
    error: null,
  });
  mocks.from.mockImplementation((table: string) =>
    table === 'documents'
      ? { select: () => ({ eq: () => ({ single }) }) }
      : { insert: vi.fn().mockResolvedValue({ error: null }) }
  );
  mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed/x' }, error: null });
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: mocks.from,
    storage: { from: () => ({ createSignedUrl: mocks.createSignedUrl }) },
  };
}

function expectNothingTouched() {
  expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled();
  expect(mocks.from).not.toHaveBeenCalled();
  expect(mocks.createSignedUrl).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createServerSupabaseClient.mockImplementation(async () => buildClient());
});

describe('download-document permission guard (#383 part A)', () => {
  describe('unauthorized caller', () => {
    beforeEach(() => {
      mocks.authorizePermission.mockResolvedValue({ authorized: false, error: 'Forbidden' });
    });

    it('getDocumentDownloadUrl fails before any query or signing', async () => {
      const res = await getDocumentDownloadUrl('doc-1');
      expect(res).toEqual({ url: null, error: 'Forbidden' });
      expect(mocks.authorizePermission).toHaveBeenCalledWith(PERMISSIONS.DOCUMENTS_VIEW);
      expectNothingTouched();
    });

    it('getDocumentViewUrl fails before any query or signing', async () => {
      const res = await getDocumentViewUrl('doc-1');
      expect(res).toEqual({ url: null, error: 'Forbidden' });
      expect(mocks.authorizePermission).toHaveBeenCalledWith(PERMISSIONS.DOCUMENTS_VIEW);
      expectNothingTouched();
    });

    it('getDocumentDownloadUrls fails every id before any query or signing', async () => {
      const res = await getDocumentDownloadUrls(['a', 'b']);
      expect(res).toEqual({ urls: {}, errors: { a: 'Forbidden', b: 'Forbidden' } });
      // Guarded once up front, not once per id via the single-document export.
      expect(mocks.authorizePermission).toHaveBeenCalledTimes(1);
      expect(mocks.authorizePermission).toHaveBeenCalledWith(PERMISSIONS.DOCUMENTS_VIEW);
      expectNothingTouched();
    });

    it('falls back to "Unauthorized" when no error message is supplied', async () => {
      mocks.authorizePermission.mockResolvedValue({ authorized: false });
      expect(await getDocumentViewUrl('doc-1')).toEqual({ url: null, error: 'Unauthorized' });
    });
  });

  describe('authorized caller', () => {
    beforeEach(() => {
      mocks.authorizePermission.mockResolvedValue({ authorized: true });
    });

    it('getDocumentDownloadUrl returns a URL', async () => {
      expect(await getDocumentDownloadUrl('doc-1')).toEqual({ url: 'https://signed/x', error: null });
      expect(mocks.authorizePermission).toHaveBeenCalledWith(PERMISSIONS.DOCUMENTS_VIEW);
    });

    it('getDocumentViewUrl returns a URL', async () => {
      expect(await getDocumentViewUrl('doc-1')).toEqual({ url: 'https://signed/x', error: null });
      expect(mocks.authorizePermission).toHaveBeenCalledWith(PERMISSIONS.DOCUMENTS_VIEW);
    });

    it('getDocumentDownloadUrls returns URLs for every id', async () => {
      const res = await getDocumentDownloadUrls(['a', 'b']);
      expect(res.urls).toEqual({ a: 'https://signed/x', b: 'https://signed/x' });
      expect(res.errors).toEqual({});
      expect(mocks.authorizePermission).toHaveBeenCalledWith(PERMISSIONS.DOCUMENTS_VIEW);
    });
  });
});
