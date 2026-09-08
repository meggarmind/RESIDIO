import { describe, expect, it } from 'vitest';
import { getEffectiveContactStatus } from '@/lib/security/utils';
import type { AccessCode } from '@/types/database';

/**
 * Regression test for #123: the security contact detail page
 * (src/app/(dashboard)/security/contacts/[id]/page.tsx) rendered
 * SecurityContactStatusBadge from the raw stored `contact.status`,
 * while the list (src/components/security/security-contacts-table.tsx)
 * rendered it from `getEffectiveContactStatus(contact.status, contact.access_codes)`.
 * A contact stored as 'active' with only expired access codes therefore
 * showed "Expired" in the list and "Active" on its own detail page.
 *
 * The detail page has no existing component-test precedent (it is a
 * client component wired to useParams/useRouter/React Query hooks with
 * no render harness elsewhere in this suite), so this test exercises the
 * shared derivation both surfaces now call, for the exact scenario from
 * the bug report: stored status 'active', all access codes expired.
 */
describe('security contact detail page status derivation (#123)', () => {
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

  it('resolves an active contact with only expired codes to "expired", matching the list', () => {
    const effectiveStatus = getEffectiveContactStatus('active', [expiredCode]);

    expect(effectiveStatus).toBe('expired');
    // The stored column itself is unchanged -- only the derived display value differs.
    expect(effectiveStatus).not.toBe('active');
  });

  it('leaves an active contact with a currently valid code as "active" (no visual change when they already agree)', () => {
    const validCode: AccessCode = {
      ...expiredCode,
      id: 'code-2',
      valid_until: '2099-01-01T00:00:00Z',
    };

    expect(getEffectiveContactStatus('active', [validCode])).toBe('active');
  });

  it('leaves non-active stored statuses (suspended/revoked) untouched regardless of access codes', () => {
    expect(getEffectiveContactStatus('suspended', [expiredCode])).toBe('suspended');
    expect(getEffectiveContactStatus('revoked', [expiredCode])).toBe('revoked');
  });
});
