// @vitest-environment jsdom
//
// Regression test for #123: the security contact detail page
// (src/app/(dashboard)/security/contacts/[id]/page.tsx) rendered
// SecurityContactStatusBadge from the raw stored `contact.status`, while the
// list (src/components/security/security-contacts-table.tsx) rendered it
// from getEffectiveContactStatus(contact.status, contact.access_codes). A
// contact stored as 'active' with only expired access codes therefore showed
// "Expired" in the list and "Active" on its own detail page.
//
// This renders the real page component with its data hooks mocked, so it
// fails if page.tsx goes back to passing the raw `contact.status` into the
// badge instead of the derived `effectiveStatus`.

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccessCode, SecurityContactWithDetails } from '@/types/database';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'contact-1' }),
  useRouter: () => ({ push: vi.fn() }),
}));

const expiredCode: AccessCode = {
  id: 'code-1',
  contact_id: 'contact-1',
  code: '1234',
  code_type: 'permanent',
  is_active: true,
  valid_from: '2020-01-01T00:00:00Z',
  valid_until: '2020-02-01T00:00:00Z', // long in the past
  max_uses: null,
  current_uses: 0,
  created_at: '2020-01-01T00:00:00Z',
  revoked_at: null,
  revoked_by: null,
};

const validCode: AccessCode = {
  ...expiredCode,
  id: 'code-2',
  valid_until: '2099-01-01T00:00:00Z',
};

function makeContact(accessCodes: AccessCode[]): SecurityContactWithDetails {
  return {
    id: 'contact-1',
    category_id: 'cat-1',
    full_name: 'Jane Visitor',
    phone_primary: '08000000000',
    phone_secondary: null,
    address: null,
    employer: null,
    relationship: null,
    id_type: null,
    id_number: null,
    id_document_url: null,
    next_of_kin_name: null,
    next_of_kin_phone: null,
    notes: null,
    photo_url: null,
    purpose: null,
    resident_id: 'resident-1',
    status: 'active',
    is_frequent_visitor: false,
    is_recurring: false,
    last_visit_at: null,
    visit_count: 0,
    expected_arrival_time: null,
    expected_departure_time: null,
    recurrence_pattern: null,
    recurrence_days: null,
    recurrence_start_date: null,
    recurrence_end_date: null,
    created_at: '2020-01-01T00:00:00Z',
    updated_at: '2020-01-01T00:00:00Z',
    created_by: null,
    category: undefined,
    resident: undefined,
    access_codes: accessCodes,
  } as unknown as SecurityContactWithDetails;
}

const noop = vi.fn();
const mutationStub = { mutateAsync: noop, isPending: false };

function mockHooksForContact(accessCodes: AccessCode[]) {
  vi.doMock('@/hooks/use-security', () => ({
    useSecurityContact: () => ({
      data: makeContact(accessCodes),
      isLoading: false,
      error: null,
      refetch: noop,
    }),
    useCurrentUserSecurityPermissions: () => ({
      data: {
        permissions: {
          update_contacts: true,
          suspend_revoke_contacts: true,
          generate_codes: true,
        },
      },
    }),
    useUpdateSecurityContactStatus: () => mutationStub,
    useDeleteSecurityContact: () => mutationStub,
    useGenerateAccessCode: () => mutationStub,
    useRevokeAccessCode: () => mutationStub,
  }));
}

describe('security contact detail page status badge (#123)', () => {
  afterEach(() => {
    cleanup();
    vi.resetModules();
    vi.doUnmock('@/hooks/use-security');
  });

  it(
    'shows "Expired" for a stored-active contact whose only code has expired, matching the list',
    async () => {
      mockHooksForContact([expiredCode]);
      const { default: SecurityContactDetailPage } = await import(
        '../app/(dashboard)/security/contacts/[id]/page'
      );

      render(<SecurityContactDetailPage />);

      // Scope to the page header (name + status badge), not the access-code
      // list below it -- an expired access code's own ValidityBadge also
      // renders the word "Expired", so an unscoped query is ambiguous.
      const heading = screen.getByRole('heading', { level: 1, name: 'Jane Visitor' });
      const header = within(heading.parentElement as HTMLElement);

      expect(header.getByText('Expired')).toBeInTheDocument();
      expect(header.queryByText('Active')).not.toBeInTheDocument();
    },
    30000
  );

  it(
    'shows "Active" for a stored-active contact with a currently valid code',
    async () => {
      mockHooksForContact([validCode]);
      const { default: SecurityContactDetailPage } = await import(
        '../app/(dashboard)/security/contacts/[id]/page'
      );

      render(<SecurityContactDetailPage />);

      const heading = screen.getByRole('heading', { level: 1, name: 'Jane Visitor' });
      const header = within(heading.parentElement as HTMLElement);

      expect(header.getByText('Active')).toBeInTheDocument();
      expect(header.queryByText('Expired')).not.toBeInTheDocument();
    },
    30000
  );
});
