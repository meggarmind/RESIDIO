'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import type { AnnouncementCategory } from '@/types/database';

type CategoryResponse = {
  data: AnnouncementCategory | null;
  error: string | null;
};

type CategoriesResponse = {
  data: AnnouncementCategory[];
  error: string | null;
};

/**
 * Get all active announcement categories
 */
export async function getAnnouncementCategories(): Promise<CategoriesResponse> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('announcement_categories')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Error fetching categories:', error);
    return { data: [], error: error.message };
  }

  return { data: data as AnnouncementCategory[], error: null };
}

/**
 * Get all categories including inactive (admin view)
 */
export async function getAllAnnouncementCategories(): Promise<CategoriesResponse> {
  const auth = await authorizePermission(PERMISSIONS.ANNOUNCEMENTS_MANAGE_CATEGORIES);
  if (!auth.authorized) {
    return { data: [], error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('announcement_categories')
    .select('*')
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Error fetching categories:', error);
    return { data: [], error: error.message };
  }

  return { data: data as AnnouncementCategory[], error: null };
}

/**
 * Create a new announcement category
 */
export async function createAnnouncementCategory(input: {
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  color?: string;
  display_order?: number;
}): Promise<CategoryResponse> {
  const auth = await authorizePermission(PERMISSIONS.ANNOUNCEMENTS_MANAGE_CATEGORIES);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  const insertData = {
    name: input.name,
    slug: input.slug.toLowerCase().replace(/\s+/g, '-'),
    description: input.description || null,
    icon: input.icon || null,
    color: input.color || 'blue',
    display_order: input.display_order ?? 0,
    is_active: true,
  };

  const { data, error } = await supabase
    .from('announcement_categories')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error('Error creating category:', error);
    return { data: null, error: error.message };
  }

  await logAudit({
    action: 'CREATE',
    entityType: 'announcement_categories',
    entityId: data.id,
    entityDisplay: data.name,
    newValues: insertData,
    description: `Created announcement category: ${data.name}`,
  });

  return { data: data as AnnouncementCategory, error: null };
}

/**
 * Update an announcement category
 */
export async function updateAnnouncementCategory(
  id: string,
  input: Partial<{
    name: string;
    slug: string;
    description: string;
    icon: string;
    color: string;
    display_order: number;
    is_active: boolean;
  }>
): Promise<CategoryResponse> {
  const auth = await authorizePermission(PERMISSIONS.ANNOUNCEMENTS_MANAGE_CATEGORIES);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  // Fetch existing for audit
  const { data: existing } = await supabase
    .from('announcement_categories')
    .select('*')
    .eq('id', id)
    .single();

  if (!existing) {
    return { data: null, error: 'Category not found' };
  }

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.name !== undefined) updateData.name = input.name;
  if (input.slug !== undefined) updateData.slug = input.slug.toLowerCase().replace(/\s+/g, '-');
  if (input.description !== undefined) updateData.description = input.description;
  if (input.icon !== undefined) updateData.icon = input.icon;
  if (input.color !== undefined) updateData.color = input.color;
  if (input.display_order !== undefined) updateData.display_order = input.display_order;
  if (input.is_active !== undefined) updateData.is_active = input.is_active;

  const { data, error } = await supabase
    .from('announcement_categories')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating category:', error);
    return { data: null, error: error.message };
  }

  await logAudit({
    action: 'UPDATE',
    entityType: 'announcement_categories',
    entityId: id,
    entityDisplay: data.name,
    oldValues: existing,
    newValues: updateData,
    description: `Updated announcement category: ${data.name}`,
  });

  return { data: data as AnnouncementCategory, error: null };
}

/**
 * Delete an announcement category (soft delete by setting is_active = false)
 */
export async function deleteAnnouncementCategory(id: string): Promise<{
  success: boolean;
  error: string | null;
}> {
  const auth = await authorizePermission(PERMISSIONS.ANNOUNCEMENTS_MANAGE_CATEGORIES);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  // Check if category is in use
  const { count } = await supabase
    .from('announcements')
    .select('*', { count: 'exact', head: true })
    .eq('category_id', id);

  if (count && count > 0) {
    return {
      success: false,
      error: `Cannot delete category. It is used by ${count} announcement(s).`,
    };
  }

  // Soft delete
  const { error } = await supabase
    .from('announcement_categories')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('Error deleting category:', error);
    return { success: false, error: error.message };
  }

  await logAudit({
    action: 'DELETE',
    entityType: 'announcement_categories',
    entityId: id,
    description: `Deactivated announcement category`,
  });

  return { success: true, error: null };
}
