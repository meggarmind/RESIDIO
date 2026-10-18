// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({
  permissions: [] as string[],
  rows: [] as Record<string, unknown>[],
  mutate: vi.fn(),
}));

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({
    isLoading: false,
    hasPermission: (p: string) => mocks.permissions.includes(p),
  }),
}));

vi.mock('@/contexts/visual-theme-context', () => ({
  useVisualTheme: () => ({ themeId: 'default' }),
}));

vi.mock('@/hooks/use-approvals', () => ({
  useApprovalRequests: () => ({
    isLoading: false,
    data: { count: mocks.rows.length, data: mocks.rows },
  }),
  useApproveRequest: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRejectRequest: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReapplyApprovedRequest: () => ({ mutate: mocks.mutate, isPending: false }),
}));

import ApprovalsPage from '@/app/(dashboard)/approvals/page';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const row = (over: Record<string, unknown>) => ({
  id: 'req-1',
  request_type: 'billing_profile_effective_date',
  entity_name: 'Profile One',
  requested_changes: {},
  current_values: {},
  requester: { full_name: 'Requester One' },
  reviewer: { full_name: 'Reviewer One' },
  status: 'approved',
  reviewed_at: new Date(Date.now() - 30 * 60_000).toISOString(),
  applied_at: null,
  created_at: new Date().toISOString(),
  ...over,
});

beforeEach(() => {
  mocks.permissions = [PERMISSIONS.APPROVALS_VIEW];
  mocks.rows = [row({})];
  mocks.mutate.mockReset();
});
afterEach(() => cleanup());

describe('ApprovalsPage re-apply (#557)', () => {
  it('shows the badge only for a stuck approval', () => {
    mocks.rows = [
      row({ id: 'a', entity_name: 'Stuck' }),
      row({ id: 'b', entity_name: 'Applied', applied_at: new Date().toISOString() }),
      row({ id: 'c', entity_name: 'Fresh', reviewed_at: new Date().toISOString() }),
      row({ id: 'd', entity_name: 'Pending', status: 'pending', reviewed_at: null }),
    ];
    render(<ApprovalsPage />);

    expect(within(screen.getByRole('table')).getAllByText('Approved, not applied')).toHaveLength(1);
    expect(within(screen.getByTestId('approval-card-list')).getAllByText('Approved, not applied')).toHaveLength(1);
  });

  it('shows Re-apply to a holder of approvals.approve_reject and calls the mutation', () => {
    mocks.permissions = [PERMISSIONS.APPROVALS_VIEW, PERMISSIONS.APPROVALS_APPROVE_REJECT];
    render(<ApprovalsPage />);

    fireEvent.click(within(screen.getByRole('table')).getByRole('button', { name: /re-apply/i }));

    expect(mocks.mutate).toHaveBeenCalledWith({ requestId: 'req-1' });
  });

  it('does not show Re-apply to a view-only user (the badge still shows)', () => {
    render(<ApprovalsPage />);

    expect(within(screen.getByRole('table')).getByText('Approved, not applied')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /re-apply/i })).not.toBeInTheDocument();
  });

  it('offers no Re-apply on an applied request', () => {
    mocks.permissions = [PERMISSIONS.APPROVALS_VIEW, PERMISSIONS.APPROVALS_APPROVE_REJECT];
    mocks.rows = [row({ applied_at: new Date().toISOString() })];
    render(<ApprovalsPage />);

    expect(screen.queryByRole('button', { name: /re-apply/i })).not.toBeInTheDocument();
  });
});
