// @vitest-environment jsdom
//
// #215: when the payment metrics RPC fails (or its migration is not applied yet), the admin
// snapshot must report financialHealth as null so the dashboard renders its "unavailable" state,
// not a zero-filled object that reads as real "0 revenue / 0% collected" data.

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { getAdminDashboardSnapshot } from '@/actions/dashboard/get-enhanced-dashboard-stats';
import { ModernFinancialHealth } from '@/components/dashboard/modern-financial-health';
import { ModernStatsCards } from '@/components/dashboard/modern-stats-cards';

const { authorizePermission, getCurrentUserPermissions, createServerSupabaseClient } = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  getCurrentUserPermissions: vi.fn(),
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission, getCurrentUserPermissions }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient }));
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

beforeAll(() => {
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

afterEach(() => cleanup());

function chain() {
  const query: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'neq', 'in', 'not', 'gt', 'gte', 'lt', 'lte', 'or', 'order', 'limit']) {
    query[m] = vi.fn(() => query);
  }
  query.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve({ data: [], count: 3, error: null }).then(resolve, reject);
  return query;
}

async function failedSnapshot() {
  authorizePermission.mockResolvedValue({ authorized: true });
  getCurrentUserPermissions.mockResolvedValue({ userId: 'u', permissions: [] });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  createServerSupabaseClient.mockResolvedValue({
    from: () => chain(),
    rpc: () => Promise.resolve({ data: null, error: { message: 'function does not exist' } }),
  });
  const { data } = await getAdminDashboardSnapshot();
  return data!;
}

describe('a failed financial section renders unavailable, not zeros (#215)', () => {
  it('ModernFinancialHealth shows the unavailable state for the failed snapshot', async () => {
    const snapshot = await failedSnapshot();
    expect(snapshot.financialHealth).toBeNull();

    render(<ModernFinancialHealth financialHealth={snapshot.financialHealth} isLoading={false} />);

    expect(screen.getByText('Financial metrics unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Resident Wallet Credits')).not.toBeInTheDocument();
  });

  it('ModernStatsCards shows the unavailable state, not a 0% collection card', async () => {
    const snapshot = await failedSnapshot();

    render(
      <ModernStatsCards
        financialHealth={snapshot.financialHealth}
        quickStats={snapshot.quickStats}
        actionMetrics={snapshot.actionMetrics}
        isLoading={false}
        isUnavailable={false}
      />,
    );

    expect(screen.getByText('Dashboard metrics unavailable')).toBeInTheDocument();
  });
});
