import { describe, expect, it } from 'vitest';
import {
  filterVisibleContacts,
  getEmptyStateMessage,
} from '@/components/security/security-contacts-table';
import type { AccessCode, SecurityContactStatus } from '@/types/database';

// These cover the two exported pure functions in isolation. The render-level
// regression coverage for #124 (proving the empty-state message shown by the
// actual component agrees with the rows actually hidden) lives in
// security-contacts-table-empty-state.render.test.tsx, which mounts the real
// component with `@vitest-environment jsdom` — see that file for precedent
// and rationale.

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

function contact(status: SecurityContactStatus, accessCodes: AccessCode[]) {
  return { id: 'contact-x', status, access_codes: accessCodes };
}

describe('filterVisibleContacts', () => {
  it('hides effectively-expired contacts when showExpired is false', () => {
    const contacts = [
      contact('active', [expiredCode()]), // effective status: expired
      contact('active', [expiredCode({ valid_until: '2099-01-01T00:00:00.000Z' })]), // still valid
    ];

    const visible = filterVisibleContacts(contacts, false);

    expect(visible).toHaveLength(1);
    expect(visible[0]).toBe(contacts[1]);
  });

  it('shows only effectively-expired contacts when showExpired is true', () => {
    const contacts = [
      contact('active', [expiredCode()]),
      contact('active', [expiredCode({ valid_until: '2099-01-01T00:00:00.000Z' })]),
    ];

    const visible = filterVisibleContacts(contacts, true);

    expect(visible).toHaveLength(1);
    expect(visible[0]).toBe(contacts[0]);
  });
});

describe('getEmptyStateMessage', () => {
  it('reports "no contacts" when nothing was fetched at all', () => {
    const message = getEmptyStateMessage({
      totalFetched: 0,
      visibleCount: 0,
      showExpired: false,
    });

    expect(message).toBe('No security contacts found');
  });

  it('regression: names the hidden-expired count when contacts exist but all are filtered out with showExpired false', () => {
    // This is the #124 bug: contacts.length > 0 but every row is effectively
    // expired and showExpired is off, so the row-producing filter yields zero
    // rows. The empty state must reflect that, not stay silent.
    const message = getEmptyStateMessage({
      totalFetched: 3,
      visibleCount: 0,
      showExpired: false,
    });

    expect(message).not.toBe('No security contacts found');
    expect(message).toContain('3');
    expect(message.toLowerCase()).toContain('expired');
  });

  it('gives a distinct message when showExpired is true and there are no expired contacts', () => {
    const message = getEmptyStateMessage({
      totalFetched: 5,
      visibleCount: 0,
      showExpired: true,
    });

    expect(message).toBe('No expired contacts found');
  });

  it('is not triggered when rows are actually visible', () => {
    const message = getEmptyStateMessage({
      totalFetched: 5,
      visibleCount: 2,
      showExpired: false,
    });

    expect(message).toBe('No security contacts found');
  });

  it('uses the exact number of hidden rows, not an unrelated estate-wide count (#124)', () => {
    // Regression for the specific defect: the message must be driven by
    // totalFetched - visibleCount (rows actually hidden on this fetch), never
    // by a separate estate-wide figure that can diverge from what's on screen
    // (a later page, or a resident-scoped table).
    const message = getEmptyStateMessage({
      totalFetched: 7,
      visibleCount: 0,
      showExpired: false,
    });

    expect(message).toContain('7');
  });
});
