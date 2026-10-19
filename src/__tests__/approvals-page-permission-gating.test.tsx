// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({
  permissions: [] as string[],
  isLoading: false,
}));

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({
    isLoading: mocks.isLoading,
    hasPermission: (p: string) => mocks.permissions.includes(p),
  }),
}));

vi.mock('@/contexts/visual-theme-context', () => ({
  useVisualTheme: () => ({ themeId: 'default' }),
}));

vi.mock('@/hooks/use-approvals', () => ({
  useApprovalRequests: () => ({
    isLoading: false,
    data: {
      count: 1,
      data: [
        {
          id: 'req-1',
          request_type: 'late_fee_waiver',
          entity_name: 'Invoice INV-1',
          requested_changes: {},
          current_values: {},
          requester: { full_name: 'Requester One' },
          reviewer: null,
          status: 'pending',
          created_at: new Date().toISOString(),
        },
      ],
    },
  }),
  useApproveRequest: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRejectRequest: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import ApprovalsPage from '@/app/(dashboard)/approvals/page';
import { PERMISSIONS } from '@/lib/auth/action-roles';

beforeEach(() => {
  mocks.permissions = [];
  mocks.isLoading = false;
});
afterEach(() => cleanup());

describe('ApprovalsPage permission gating (issue #462)', () => {
  it('hides Approve and Reject from an approvals.view-only user', () => {
    mocks.permissions = [PERMISSIONS.APPROVALS_VIEW];
    render(<ApprovalsPage />);

    // The row is still readable...
    expect(within(screen.getByRole('table')).getByText('Invoice INV-1')).toBeInTheDocument();
    // ...but the actions are not offered.
    expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reject/i })).not.toBeInTheDocument();
  });

  it('shows Approve and Reject to a user holding approvals.approve_reject', () => {
    mocks.permissions = [PERMISSIONS.APPROVALS_VIEW, PERMISSIONS.APPROVALS_APPROVE_REJECT];
    render(<ApprovalsPage />);

    // One in the table row and one on the phone card (#744)
    expect(screen.getAllByRole('button', { name: /approve/i })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /reject/i })).toHaveLength(2);
  });
});
