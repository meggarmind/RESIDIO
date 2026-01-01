'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { sanitizeSearchInput } from '@/lib/utils';
import type { AnnouncementWithRelations, AnnouncementListParams } from '@/types/database';

type GetAnnouncementsResponse = {
  data: AnnouncementWithRelations[];
  count: number;
  error: string | null;
};

/**
 * Get announcements with optional filtering, search, and pagination
 * For admin/management use - returns all statuses
 */
export async function getAnnouncements(
  params: AnnouncementListParams = {}
): Promise<GetAnnouncementsResponse> {
  const supabase = await createServerSupabaseClient();
  const {
    status,
    category_id,
    priority,
    search,
    is_pinned,
    from_date,
    to_date,
    page = 1,
    limit = 20,
  } = params;

  let query = supabase
    .from('announcements')
    .select(
      `
      *,
      category:announcement_categories(id, name, slug, icon, color),
      creator:profiles!created_by(id, full_name),
      updater:profiles!updated_by(id, full_name)
    `,
      { count: 'exact' }
    );

  // Apply filters
  if (status) {
    query = query.eq('status', status);
  }

  if (category_id) {
    query = query.eq('category_id', category_id);
  }

  if (priority) {
    query = query.eq('priority', priority);
  }

  if (is_pinned !== undefined) {
    query = query.eq('is_pinned', is_pinned);
  }

  if (from_date) {
    query = query.gte('created_at', from_date);
  }

  if (to_date) {
    query = query.lte('created_at', to_date);
  }

  // Full-text search on title, content, and summary
  if (search) {
    const sanitized = sanitizeSearchInput(search);
    query = query.or(
      `title.ilike.%${sanitized}%,content.ilike.%${sanitized}%,summary.ilike.%${sanitized}%`
    );
  }

  // Pagination
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  query = query
    .range(from, to)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false });

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching announcements:', error);
    return { data: [], count: 0, error: error.message };
  }

  return {
    data: (data ?? []) as AnnouncementWithRelations[],
    count: count ?? 0,
    error: null,
  };
}

/**
 * Get published announcements for resident portal
 * Automatically filters by status=published and respects expires_at
 */
export async function getPublishedAnnouncements(params: {
  category?: string;
  limit?: number;
  page?: number;
} = {}): Promise<GetAnnouncementsResponse> {
  const supabase = await createServerSupabaseClient();
  const { category, limit = 10, page = 1 } = params;

  let query = supabase
    .from('announcements')
    .select(
      `
      *,
      category:announcement_categories(id, name, slug, icon, color)
    `,
      { count: 'exact' }
    )
    .eq('status', 'published')
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);

  if (category) {
    // Join with category to filter by slug
    query = query.eq('category.slug', category);
  }

  // Pagination
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  query = query
    .range(from, to)
    .order('is_pinned', { ascending: false })
    .order('published_at', { ascending: false });

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching published announcements:', error);
    return { data: [], count: 0, error: error.message };
  }

  return {
    data: (data ?? []) as AnnouncementWithRelations[],
    count: count ?? 0,
    error: null,
  };
}

/**
 * Get a single announcement by ID
 */
export async function getAnnouncement(id: string): Promise<{
  data: AnnouncementWithRelations | null;
  error: string | null;
}> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('announcements')
    .select(
      `
      *,
      category:announcement_categories(id, name, slug, icon, color, description),
      creator:profiles!created_by(id, full_name),
      updater:profiles!updated_by(id, full_name)
    `
    )
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching announcement:', error);
    return { data: null, error: error.message };
  }

  return {
    data: data as AnnouncementWithRelations,
    error: null,
  };
}

/**
 * Get read statistics for an announcement
 */
export async function getAnnouncementReadStats(announcementId: string): Promise<{
  totalReads: number;
  readers: Array<{
    resident_id: string;
    resident_name: string;
    read_at: string;
  }>;
  error: string | null;
}> {
  const supabase = await createServerSupabaseClient();

  const { data, error, count } = await supabase
    .from('announcement_read_receipts')
    .select(
      `
      resident_id,
      read_at,
      resident:residents(first_name, last_name)
    `,
      { count: 'exact' }
    )
    .eq('announcement_id', announcementId)
    .order('read_at', { ascending: false });

  if (error) {
    console.error('Error fetching read stats:', error);
    return { totalReads: 0, readers: [], error: error.message };
  }

  const readers = (data ?? []).map((r) => {
    // Supabase returns joined data as array in types, but it's a single object at runtime
    // for one-to-one joins - cast through unknown to satisfy TypeScript
    const resident = r.resident as unknown as { first_name: string; last_name: string } | null;
    return {
      resident_id: r.resident_id,
      resident_name: resident
        ? `${resident.first_name} ${resident.last_name}`
        : 'Unknown',
      read_at: r.read_at,
    };
  });

  return {
    totalReads: count ?? 0,
    readers,
    error: null,
  };
}
