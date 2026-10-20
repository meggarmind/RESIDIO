// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const readAdminReadSnapshot = vi.fn();

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({ user: { id: 'u1', app_metadata: {}, user_metadata: {} } }),
}));
vi.mock('@/lib/offline/admin-read-cache', () => ({
  readAdminReadSnapshot: (...args: unknown[]) => readAdminReadSnapshot(...args),
  saveAdminReadSnapshot: vi.fn(),
}));
vi.mock('@/lib/performance', () => ({ recordPerformanceEvent: vi.fn() }));

import { useOfflineAdminSnapshot } from '@/hooks/use-offline-admin-snapshot';

const key = ['dashboard', 'snapshot'];

function setup(seed?: { data: string; updatedAt: number }, queryFn = vi.fn().mockResolvedValue('live')) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (seed) client.setQueryData(key, seed.data, { updatedAt: seed.updatedAt });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(
    () => useOfflineAdminSnapshot({ queryKey: key, cacheKey: 'dashboard', queryFn, ttlMs: 60_000, queryOptions: { staleTime: 60_000 } }),
    { wrapper },
  );
  return { client, hook, queryFn };
}

describe('useOfflineAdminSnapshot with hydrated data', () => {
  const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;

  beforeEach(() => {
    readAdminReadSnapshot.mockReset();
    readAdminReadSnapshot.mockResolvedValue({ data: 'old', savedAt: twoDaysAgo, expiresAt: twoDaysAgo + 60_000, isStale: true });
  });

  it('does not report a stale snapshot over fresher hydrated data', async () => {
    const { hook, client, queryFn } = setup({ data: 'hydrated', updatedAt: Date.now() });
    await waitFor(() => expect(readAdminReadSnapshot).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(queryFn).not.toHaveBeenCalled();
    expect(hook.result.current.isStaleSnapshot).toBe(false);
    expect(client.getQueryData(key)).toBe('hydrated');
  });

  it('still reports the cached snapshot while there is no live data yet', async () => {
    const { hook, client } = setup(undefined, vi.fn(() => new Promise<string>(() => {})));
    await waitFor(() => expect(hook.result.current.isStaleSnapshot).toBe(true));
    expect(client.getQueryData(key)).toBe('old');
  });
});
