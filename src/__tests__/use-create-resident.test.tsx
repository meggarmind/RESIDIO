// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/actions/residents/create-resident', () => ({
  createResident: vi.fn(async () => ({ data: { id: 'r1' }, error: null })),
}));

import { useCreateResident } from '@/hooks/use-residents';

describe('useCreateResident', () => {
  // The house page reads ['house', id]; without this it stays stale after Add Resident (#1181).
  it('invalidates the house page query so the new resident shows on return', async () => {
    const queryClient = new QueryClient();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useCreateResident(), { wrapper });

    await result.current.mutateAsync({ data: {} as never });

    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ['house'] }));
  });
});
