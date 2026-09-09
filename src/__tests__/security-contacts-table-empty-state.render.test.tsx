// @vitest-environment jsdom
//
// Issue #124: getEmptyStateMessage() names a "hidden and expired" count that
// used to come from useExpiredContactCount() -- an estate-wide, unpaginated
// count with no residentId scoping. The pure-function tests in
// security-contacts-table-empty-state.test.ts pin that helper directly, but
// they can't catch a defect at the *call site* -- e.g. the table quietly
// reverting to `contacts.length === 0` instead of `visibleContacts.length ===
// 0` to decide whether to show the empty state at all. These tests mount the
// real `SecurityContactsTable` component (mocking only the React Query hooks
// it reads its data through, per the precedent in
// profile-fetch-failure-cache.test.tsx on fix/issue-256) and assert on what a
// user actually sees.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SecurityContactsTable } from '@/components/security/security-contacts-table';
import type { AccessCode, SecurityContactStatus } from '@/types/database';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// EnhancedTableCard pulls in VisualThemeProvider/useTheme/React-Query theme
// lookups that are irrelevant to this component's own logic -- mock it down
// to a passthrough, same spirit as mocking next/link above.
vi.mock('@/components/dashboard/enhanced-stat-card', () => ({
  EnhancedTableCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

let mockContacts: unknown[] = [];
let mockExpiredCount: number | undefined = undefined;

vi.mock('@/hooks/use-security', () => ({
  useSecurityContacts: () => ({
    data: { data: mockContacts, count: mockContacts.length },
    isLoading: false,
    error: null,
  }),
  useSecurityContactCategories: () => ({ data: [] }),
  useExpiredContactCount: () => ({ data: mockExpiredCount }),
}));

function expiredCode(overrides: Partial<AccessCode> = {}): AccessCode {
  return {
    id: 'code-1',
    code: 'ABC123',
    code_type: 'one_time',
    contact_id: 'contact-1',
    created_at: '2026-01-01T00:00:00.000Z',
    current_uses: 0,
    is_active: true,
    max_uses: 1,
    revoked_at: null,
    revoked_by: null,
    valid_from: '2026-01-01T00:00:00.000Z',
    valid_until: '2026-01-02T00:00:00.000Z', // long past
    ...overrides,
  };
}

function validCode(overrides: Partial<AccessCode> = {}): AccessCode {
  return expiredCode({ valid_until: '2099-01-01T00:00:00.000Z', ...overrides });
}

let contactSeq = 0;
function expiredContact(status: SecurityContactStatus = 'active') {
  contactSeq += 1;
  return {
    id: `contact-${contactSeq}`,
    full_name: `Expired Contact ${contactSeq}`,
    phone_primary: '0800000000',
    status,
    access_codes: [expiredCode({ id: `code-${contactSeq}` })],
    category: { name: 'Vendor' },
  };
}

function activeContact() {
  contactSeq += 1;
  return {
    id: `contact-${contactSeq}`,
    full_name: `Active Contact ${contactSeq}`,
    phone_primary: '0800000001',
    status: 'active' as SecurityContactStatus,
    access_codes: [validCode({ id: `code-${contactSeq}` })],
    category: { name: 'Vendor' },
  };
}

describe('SecurityContactsTable empty-state rendering (#124)', () => {
  afterEach(() => {
    cleanup();
    mockContacts = [];
    mockExpiredCount = undefined;
    contactSeq = 0;
  });

  it('shows the genuinely-empty message when nothing was fetched at all', () => {
    mockContacts = [];
    mockExpiredCount = 0;

    render(<SecurityContactsTable />);

    expect(screen.getByText('No security contacts found')).toBeTruthy();
  });

  it('MUTATION TARGET: shows the hidden-and-expired message (not a blank body) when every fetched row is expired and hidden', () => {
    // This is the #124 regression: 3 contacts were fetched, all 3 are
    // effectively expired, showExpired is off, so zero rows render. If the
    // empty-state gate at the call site reverts from
    // `visibleContacts.length === 0` to `contacts.length === 0`, this branch
    // is skipped (contacts.length is 3, not 0) and the table body renders
    // nothing at all -- no rows, no message. Asserting the message text is
    // present is what catches that regression.
    mockContacts = [expiredContact(), expiredContact(), expiredContact()];
    mockExpiredCount = 3; // estate-wide count agrees here, so this alone would not catch #124

    render(<SecurityContactsTable />);

    expect(screen.getByText(/expired and hidden/i)).toBeTruthy();
    expect(screen.queryByText('Expired Contact 1')).toBeNull();
  });

  it('pins the corrected count: uses rows actually hidden on this fetch, not the estate-wide expired count', () => {
    // The defect: the message used to read useExpiredContactCount() (7 here,
    // estate-wide, unpaginated) instead of the 2 rows actually fetched and
    // hidden on this page. The message must say 2, not 7.
    mockContacts = [expiredContact(), expiredContact()];
    mockExpiredCount = 7;

    render(<SecurityContactsTable />);

    const message = screen.getByText(/expired and hidden/i);
    expect(message.textContent).toContain('2');
    expect(message.textContent).not.toContain('7');
  });

  it('pins the corrected count when the table is residentId-scoped', () => {
    // A resident-scoped table's fetched page is small and unrelated to the
    // estate-wide expired count; the message must reflect what was actually
    // fetched for this resident, not the global figure.
    mockContacts = [expiredContact()];
    mockExpiredCount = 12;

    render(<SecurityContactsTable residentId="resident-1" />);

    const message = screen.getByText(/expired and hidden/i);
    expect(message.textContent).toContain('1');
    expect(message.textContent).not.toContain('12');
  });

  it(
    'shows "No expired contacts found" when showExpired is on and nothing is expired',
    () => {
      mockContacts = [activeContact(), activeContact()];
      mockExpiredCount = 0;

      render(<SecurityContactsTable showResidentColumn={false} />);

      // Simulate the showExpired=true state indirectly is not possible
      // without driving the toggle button, since showExpired is internal
      // component state -- click it.
      fireEvent.click(screen.getByRole('button', { name: /show expired/i }));

      expect(screen.getByText('No expired contacts found')).toBeTruthy();
    },
    10000
  );

  it('renders real rows (not the empty state) when at least one row is visible', () => {
    mockContacts = [activeContact(), expiredContact()];
    mockExpiredCount = 1;

    render(<SecurityContactsTable showResidentColumn={false} />);

    expect(screen.getByText('Active Contact 1')).toBeTruthy();
    expect(screen.queryByText(/expired and hidden/i)).toBeNull();
  });
});
