// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// #1068: a levy run that raises nothing because no landlord is on record must name the house,
// not tell the admin every house is up to date.

const m = vi.hoisted(() => ({
  generate: vi.fn(),
  toast: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

vi.mock('sonner', () => ({ toast: m.toast }));
vi.mock('@/actions/billing/generate-levies', () => ({ generateRetroactiveLevies: m.generate }));

import { useGenerateRetroactiveLevies } from '@/hooks/use-settings';

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client: new QueryClient() }, children);

async function run(result: { generated: number; warnings: string[] }) {
  m.generate.mockResolvedValue({ success: true, errors: [], skipped: 0, ...result });
  const { result: hook } = renderHook(() => useGenerateRetroactiveLevies(), { wrapper });
  await act(() => hook.current.mutateAsync());
}

describe('useGenerateRetroactiveLevies toast (#1068)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('names the house and does not claim all houses are up to date', async () => {
    const warning = 'House H2: no landlord on record, so "Development Fee" was not raised';
    await run({ generated: 0, warnings: [warning] });
    expect(m.toast.warning).toHaveBeenCalledWith(warning);
    expect(m.toast.info).not.toHaveBeenCalled();
  });

  it('reports the generated count and still shows the warnings', async () => {
    await run({ generated: 2, warnings: ['House H9: no landlord on record, so "Transformer Fee" was not raised'] });
    expect(m.toast.success).toHaveBeenCalledWith('Generated 2 levies for existing houses');
    expect(m.toast.warning).toHaveBeenCalledWith(expect.stringContaining('House H9'));
  });

  it('says all houses are up to date only when nothing was raised and nothing was skipped', async () => {
    await run({ generated: 0, warnings: [] });
    expect(m.toast.info).toHaveBeenCalledWith('No new levies to generate - all houses are up to date');
    expect(m.toast.warning).not.toHaveBeenCalled();
  });
});
