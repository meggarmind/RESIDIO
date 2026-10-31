import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleGroupMembersLeft } from '@/lib/whatsapp/group-leave';
import { createAdminClient } from '@/lib/supabase/server';
import { notifyAdmins } from '@/lib/notifications/admin-notifier';
import { recordAudit } from '@/lib/audit/recorder';

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/notifications/admin-notifier', () => ({ notifyAdmins: vi.fn() }));
vi.mock('@/lib/audit/recorder', () => ({ recordAudit: vi.fn() }));

function admin(deleted: unknown[] | null, deleteError: unknown = null) {
  const deleteEq = vi.fn();
  const calls: string[] = [];
  const from = vi.fn((table: string) => {
    calls.push(table);
    if (table === 'whatsapp_sessions') {
      return {
        delete: () => ({
          eq: (...args: unknown[]) => {
            deleteEq(...args);
            return { select: () => Promise.resolve({ data: deleted, error: deleteError }) };
          },
        }),
      };
    }
    return {
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: { first_name: 'Ada', last_name: 'Obi', resident_code: 'R1' } }) }),
      }),
    };
  });
  vi.mocked(createAdminClient).mockReturnValue({ from } as never);
  return { deleteEq, calls };
}

const left = (over: Partial<{ resident_id: string | null; phone: string | null }> = {}) => ({
  group_id: '1203@g.us',
  member_id: '2348011111111@c.us',
  phone: '+2348011111111',
  resident_id: 'resident-1',
  ...over,
});

describe('group leave handling (#1326)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('deletes the session, notifies the office once and records one audit row', async () => {
    const { deleteEq, calls } = admin([{ id: 's1' }]);
    await handleGroupMembersLeft([left()]);

    expect(deleteEq).toHaveBeenCalledWith('phone_number', '+2348011111111');
    expect(notifyAdmins).toHaveBeenCalledTimes(1);
    expect(notifyAdmins).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'resident',
        actionUrl: '/residents/resident-1',
        requiredPermission: 'residents.update',
      })
    );
    expect(recordAudit).toHaveBeenCalledTimes(1);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE', entityType: 'residents', entityId: 'resident-1' }),
      { userId: null, residentId: 'resident-1' }
    );
    // The resident record is read, never written.
    expect(calls).toEqual(['whatsapp_sessions', 'residents']);
  });

  it('still notifies and audits when no session was open', async () => {
    admin([]);
    await handleGroupMembersLeft([left()]);
    expect(notifyAdmins).toHaveBeenCalledTimes(1);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ description: expect.stringContaining('no bot session was open') }),
      expect.anything()
    );
  });

  it('does nothing for an unmatched member', async () => {
    admin([]);
    await handleGroupMembersLeft([left({ resident_id: null })]);
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(notifyAdmins).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('skips the session delete when the number is unknown but still tells the office', async () => {
    const { deleteEq } = admin([]);
    await handleGroupMembersLeft([left({ phone: null })]);
    expect(deleteEq).not.toHaveBeenCalled();
    expect(notifyAdmins).toHaveBeenCalledTimes(1);
  });

  it('does not notify when the session delete fails, and carries on with the next member', async () => {
    admin(null, { message: 'boom' });
    await handleGroupMembersLeft([left(), left({ resident_id: 'resident-2' })]);
    expect(notifyAdmins).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledTimes(2);
  });
});
