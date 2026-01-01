'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';

type DeleteAnnouncementResponse = {
  success: boolean;
  error: string | null;
};

/**
 * Delete an announcement
 * Note: This permanently deletes the announcement. Consider using archiveAnnouncement instead.
 */
export async function deleteAnnouncement(
  id: string
): Promise<DeleteAnnouncementResponse> {
  // Authorization check
  const auth = await authorizePermission(PERMISSIONS.ANNOUNCEMENTS_DELETE);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  // Fetch existing announcement for audit
  const { data: existing } = await supabase
    .from('announcements')
    .select('*')
    .eq('id', id)
    .single();

  if (!existing) {
    return { success: false, error: 'Announcement not found' };
  }

  // Don't allow deletion of published announcements
  if (existing.status === 'published') {
    return {
      success: false,
      error: 'Cannot delete published announcements. Archive it instead.',
    };
  }

  const { error } = await supabase
    .from('announcements')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting announcement:', error);
    return { success: false, error: error.message };
  }

  // Log audit event
  await logAudit({
    action: 'DELETE',
    entityType: 'announcements',
    entityId: id,
    entityDisplay: existing.title,
    oldValues: existing,
    description: `Deleted announcement: ${existing.title}`,
  });

  return { success: true, error: null };
}
