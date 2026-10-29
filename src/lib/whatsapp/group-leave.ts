import { PERMISSIONS } from '@/lib/auth/action-roles';
import { recordAudit } from '@/lib/audit/recorder';
import { notifyAdmins } from '@/lib/notifications/admin-notifier';
import { createAdminClient } from '@/lib/supabase/server';
import type { LeftMember } from '@/lib/whatsapp/group-sync';

/**
 * A matched member left the estate WhatsApp group (#1326, parent #1323): close
 * their bot session and tell the office to check the record. The resident is
 * not moved out or deactivated. Called from the webhook and the nightly sync,
 * which have no web session, so this uses the service client and a system
 * audit actor (the resident, as `co-resident.ts` does for WhatsApp-driven
 * entries). A failure for one member is logged and does not stop the others.
 */
export async function handleGroupMembersLeft(members: LeftMember[]): Promise<void> {
  for (const member of members) {
    if (!member.resident_id) continue;
    try {
      await closeSessionAndNotify(member.resident_id, member.phone);
    } catch (error) {
      // The error names a database failure, never the member's number.
      console.error('[group-leave] Could not handle a group leave:', error);
    }
  }
}

async function closeSessionAndNotify(residentId: string, phone: string | null): Promise<void> {
  const admin = createAdminClient();

  let sessionClosed = false;
  if (phone) {
    const { data, error } = await admin.from('whatsapp_sessions').delete().eq('phone_number', phone).select('id');
    if (error) throw error;
    sessionClosed = (data ?? []).length > 0;
  }

  const { data: resident } = await admin
    .from('residents')
    .select('first_name, last_name, resident_code')
    .eq('id', residentId)
    .maybeSingle();
  const name = resident ? `${resident.first_name} ${resident.last_name}`.trim() : 'A resident';

  await notifyAdmins({
    title: 'Resident left the estate WhatsApp group',
    body: `${name} left the estate WhatsApp group. Their WhatsApp bot access is closed. Check whether their record is still correct.`,
    category: 'resident',
    actionUrl: `/residents/${residentId}`,
    requiredPermission: PERMISSIONS.RESIDENTS_UPDATE,
    metadata: { resident_id: residentId },
  });

  await recordAudit(
    {
      action: 'UPDATE',
      entityType: 'residents',
      entityId: residentId,
      entityDisplay: name,
      description: sessionClosed
        ? 'Left the estate WhatsApp group; bot session closed; office notified. Record unchanged.'
        : 'Left the estate WhatsApp group; no bot session was open; office notified. Record unchanged.',
    },
    { userId: null, residentId }
  );
}
