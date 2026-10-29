// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import type { GroupMembersReport } from '@/actions/whatsapp/group-members-report';
import { UnmatchedGroupMembers, findResidentHref } from '@/app/(dashboard)/settings/whatsapp/unmatched-group-members';

let granted: string[] = [];
vi.mock('@/lib/auth/auth-provider', () => ({ useAuth: () => ({ hasPermission: (permission: string) => granted.includes(permission) }) }));

const report: GroupMembersReport = {
  groupChosen: true,
  matchedCount: 41,
  retentionDays: 30,
  unmatched: [
    { id: 'm1', phone: '+2348031234567', role: 'admin', firstSeen: '2026-10-01T10:00:00Z', lastSeen: '2026-10-29T01:00:00Z' },
    { id: 'm2', phone: null, role: 'participant', firstSeen: '2026-10-02T10:00:00Z', lastSeen: '2026-10-02T10:00:00Z' },
  ],
};

describe('UnmatchedGroupMembers (#1327)', () => {
  afterEach(cleanup);
  beforeEach(() => {
    granted = [PERMISSIONS.WHATSAPP_MANAGE, PERMISSIONS.RESIDENTS_VIEW];
  });

  it('shows the rows, the matched count and the retention note', () => {
    render(<UnmatchedGroupMembers report={report} />);

    expect(screen.getByText('+2348031234567')).toBeTruthy();
    expect(screen.getByText('Number hidden by WhatsApp')).toBeTruthy();
    expect(screen.getByText(/41 members match a resident record/)).toBeTruthy();
    expect(screen.getByText(/Numbers not matched are removed after 30 days/)).toBeTruthy();
    expect(screen.getByText('01 Oct 2026')).toBeTruthy();
  });

  it('links Find resident to the residents search by the number, only for a number WAHA gave', () => {
    render(<UnmatchedGroupMembers report={report} />);

    const links = screen.getAllByRole('link', { name: 'Find resident' });
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('/residents?search=8031234567');
  });

  it('hides Find resident without residents.view', () => {
    granted = [PERMISSIONS.WHATSAPP_MANAGE];
    render(<UnmatchedGroupMembers report={report} />);

    expect(screen.queryByRole('link', { name: 'Find resident' })).toBeNull();
  });

  it('shows one line and no table without whatsapp.manage, or when the load was refused', () => {
    granted = [];
    const { container, rerender } = render(<UnmatchedGroupMembers report={report} />);
    expect(container.querySelector('table')).toBeNull();
    expect(screen.getByText(/needs the manage WhatsApp permission/)).toBeTruthy();

    granted = [PERMISSIONS.WHATSAPP_MANAGE];
    rerender(<UnmatchedGroupMembers report={null} error="Forbidden" />);
    expect(container.querySelector('table')).toBeNull();
    expect(screen.getByText('Forbidden')).toBeTruthy();
  });

  it('says so, with no empty table, when every member matches', () => {
    const { container } = render(<UnmatchedGroupMembers report={{ ...report, unmatched: [] }} />);

    expect(container.querySelector('table')).toBeNull();
    expect(screen.getByText('Every current member matches a resident record.')).toBeTruthy();
  });

  it('builds the search from the last 10 digits', () => {
    expect(findResidentHref('+234 803 123 4567')).toBe('/residents?search=8031234567');
  });
});
