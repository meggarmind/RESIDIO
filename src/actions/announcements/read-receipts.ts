'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * Mark an announcement as read for the current user
 */
export async function markAnnouncementAsRead(announcementId: string): Promise<{
  success: boolean;
  error: string | null;
}> {
  const supabase = await createServerSupabaseClient();

  // Get current user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: 'Unauthorized' };
  }

  // Get resident ID for current user
  const { data: resident } = await supabase
    .from('residents')
    .select('id')
    .eq('profile_id', user.id)
    .eq('account_status', 'active')
    .single();

  if (!resident) {
    return { success: false, error: 'Resident not found' };
  }

  // Insert read receipt (upsert to handle duplicates)
  const { error } = await supabase
    .from('announcement_read_receipts')
    .upsert(
      {
        announcement_id: announcementId,
        resident_id: resident.id,
        read_at: new Date().toISOString(),
      },
      {
        onConflict: 'announcement_id,resident_id',
        ignoreDuplicates: true,
      }
    );

  if (error) {
    console.error('Error marking announcement as read:', error);
    return { success: false, error: error.message };
  }

  return { success: true, error: null };
}

/**
 * Check if current user has read a specific announcement
 */
export async function hasReadAnnouncement(announcementId: string): Promise<{
  hasRead: boolean;
  readAt: string | null;
  error: string | null;
}> {
  const supabase = await createServerSupabaseClient();

  // Get current user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { hasRead: false, readAt: null, error: 'Unauthorized' };
  }

  // Get resident ID for current user
  const { data: resident } = await supabase
    .from('residents')
    .select('id')
    .eq('profile_id', user.id)
    .eq('account_status', 'active')
    .single();

  if (!resident) {
    return { hasRead: false, readAt: null, error: null };
  }

  const { data, error } = await supabase
    .from('announcement_read_receipts')
    .select('read_at')
    .eq('announcement_id', announcementId)
    .eq('resident_id', resident.id)
    .maybeSingle();

  if (error) {
    console.error('Error checking read status:', error);
    return { hasRead: false, readAt: null, error: error.message };
  }

  return {
    hasRead: !!data,
    readAt: data?.read_at || null,
    error: null,
  };
}

/**
 * Get read status for multiple announcements
 */
export async function getReadStatusBatch(announcementIds: string[]): Promise<{
  readStatus: Record<string, { hasRead: boolean; readAt: string | null }>;
  error: string | null;
}> {
  const supabase = await createServerSupabaseClient();

  // Get current user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { readStatus: {}, error: 'Unauthorized' };
  }

  if (announcementIds.length === 0) {
    return { readStatus: {}, error: null };
  }

  // Get resident ID for current user
  const { data: resident } = await supabase
    .from('residents')
    .select('id')
    .eq('profile_id', user.id)
    .eq('account_status', 'active')
    .single();

  if (!resident) {
    // Return all as unread if no resident record
    const readStatus: Record<string, { hasRead: boolean; readAt: string | null }> = {};
    for (const id of announcementIds) {
      readStatus[id] = { hasRead: false, readAt: null };
    }
    return { readStatus, error: null };
  }

  const { data, error } = await supabase
    .from('announcement_read_receipts')
    .select('announcement_id, read_at')
    .eq('resident_id', resident.id)
    .in('announcement_id', announcementIds);

  if (error) {
    console.error('Error fetching read status:', error);
    return { readStatus: {}, error: error.message };
  }

  // Build status map
  const readStatus: Record<string, { hasRead: boolean; readAt: string | null }> = {};

  // Initialize all as unread
  for (const id of announcementIds) {
    readStatus[id] = { hasRead: false, readAt: null };
  }

  // Mark read ones
  for (const receipt of data ?? []) {
    readStatus[receipt.announcement_id] = {
      hasRead: true,
      readAt: receipt.read_at,
    };
  }

  return { readStatus, error: null };
}
