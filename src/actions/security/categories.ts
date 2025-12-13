'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { SecurityContactCategory } from '@/types/database';
import type { UpdateCategoryData } from '@/lib/validators/security-contact';
import { hasSecurityPermission } from './settings';
import { logAudit } from '@/lib/audit/logger';
import { getChangedValues } from '@/lib/audit/helpers';

export interface CategoryResponse {
  data: SecurityContactCategory | null;
  error: string | null;
}

export interface CategoriesResponse {
  data: SecurityContactCategory[];
  error: string | null;
}

/**
 * Gets all security contact categories
 */
export async function getSecurityContactCategories(
  includeInactive: boolean = false
): Promise<CategoriesResponse> {
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from('security_contact_categories')
    .select('*')
    .order('sort_order', { ascending: true });

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Get categories error:', error);
    return { data: [], error: 'Failed to fetch categories' };
  }

  return { data: data || [], error: null };
}

/**
 * Gets a single category by ID
 */
export async function getSecurityContactCategory(id: string): Promise<CategoryResponse> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('security_contact_categories')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Get category error:', error);
    return { data: null, error: 'Category not found' };
  }

  return { data, error: null };
}

/**
 * Updates a category (admin only)
 */
export async function updateSecurityContactCategory(
  formData: UpdateCategoryData
): Promise<CategoryResponse> {
  const supabase = await createServerSupabaseClient();

  // Check permission
  const canConfigure = await hasSecurityPermission('configure_categories');
  if (!canConfigure) {
    return { data: null, error: 'Permission denied: Only administrators can configure categories' };
  }

  const { id, ...updateData } = formData;

  // Get existing category for audit
  const { data: existingCategory, error: fetchError } = await supabase
    .from('security_contact_categories')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !existingCategory) {
    return { data: null, error: 'Category not found' };
  }

  // Build update object (only include non-undefined fields)
  const updateObject: Record<string, any> = {};
  for (const [key, value] of Object.entries(updateData)) {
    if (value !== undefined) {
      updateObject[key] = value === '' ? null : value;
    }
  }

  if (Object.keys(updateObject).length === 0) {
    return { data: existingCategory, error: null };
  }

  const { data: category, error: updateError } = await supabase
    .from('security_contact_categories')
    .update(updateObject)
    .eq('id', id)
    .select()
    .single();

  if (updateError) {
    console.error('Update category error:', updateError);
    return { data: null, error: 'Failed to update category' };
  }

  // Audit log with changes
  const changes = getChangedValues(existingCategory, category);
  if (Object.keys(changes.new).length > 0) {
    await logAudit({
      action: 'UPDATE',
      entityType: 'security_contact_categories',
      entityId: category.id,
      entityDisplay: category.name,
      oldValues: changes.old,
      newValues: changes.new,
    });
  }

  revalidatePath('/security');
  revalidatePath('/settings/security');

  return { data: category, error: null };
}

/**
 * Creates a new category (admin only)
 */
export async function createSecurityContactCategory(data: {
  name: string;
  description?: string;
  default_validity_days: number;
  max_validity_days: number;
  requires_photo?: boolean;
  requires_id_document?: boolean;
  sort_order?: number;
}): Promise<CategoryResponse> {
  const supabase = await createServerSupabaseClient();

  // Check permission
  const canConfigure = await hasSecurityPermission('configure_categories');
  if (!canConfigure) {
    return { data: null, error: 'Permission denied: Only administrators can create categories' };
  }

  // Check if category name already exists
  const { data: existing } = await supabase
    .from('security_contact_categories')
    .select('id')
    .ilike('name', data.name)
    .single();

  if (existing) {
    return { data: null, error: 'A category with this name already exists' };
  }

  const { data: category, error: createError } = await supabase
    .from('security_contact_categories')
    .insert({
      name: data.name,
      description: data.description || null,
      default_validity_days: data.default_validity_days,
      max_validity_days: data.max_validity_days,
      requires_photo: data.requires_photo || false,
      requires_id_document: data.requires_id_document || false,
      sort_order: data.sort_order || 0,
      is_active: true,
    })
    .select()
    .single();

  if (createError) {
    console.error('Create category error:', createError);
    return { data: null, error: 'Failed to create category' };
  }

  // Audit log
  await logAudit({
    action: 'CREATE',
    entityType: 'security_contact_categories',
    entityId: category.id,
    entityDisplay: category.name,
    newValues: category,
  });

  revalidatePath('/security');
  revalidatePath('/settings/security');

  return { data: category, error: null };
}

/**
 * Toggles a category's active status
 */
export async function toggleCategoryActive(id: string): Promise<CategoryResponse> {
  const supabase = await createServerSupabaseClient();

  // Check permission
  const canConfigure = await hasSecurityPermission('configure_categories');
  if (!canConfigure) {
    return { data: null, error: 'Permission denied' };
  }

  // Get current status
  const { data: existing, error: fetchError } = await supabase
    .from('security_contact_categories')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !existing) {
    return { data: null, error: 'Category not found' };
  }

  // Toggle status
  const { data: category, error: updateError } = await supabase
    .from('security_contact_categories')
    .update({ is_active: !existing.is_active })
    .eq('id', id)
    .select()
    .single();

  if (updateError) {
    console.error('Toggle category error:', updateError);
    return { data: null, error: 'Failed to toggle category status' };
  }

  // Audit log
  await logAudit({
    action: category.is_active ? 'ACTIVATE' : 'DEACTIVATE',
    entityType: 'security_contact_categories',
    entityId: category.id,
    entityDisplay: category.name,
    oldValues: { is_active: existing.is_active },
    newValues: { is_active: category.is_active },
  });

  revalidatePath('/security');
  revalidatePath('/settings/security');

  return { data: category, error: null };
}

/**
 * Reorders categories
 */
export async function reorderCategories(
  orderedIds: string[]
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  // Check permission
  const canConfigure = await hasSecurityPermission('configure_categories');
  if (!canConfigure) {
    return { success: false, error: 'Permission denied' };
  }

  const errors: string[] = [];

  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from('security_contact_categories')
      .update({ sort_order: i })
      .eq('id', orderedIds[i]);

    if (error) {
      errors.push(`${orderedIds[i]}: ${error.message}`);
    }
  }

  if (errors.length > 0) {
    return { success: false, error: errors.join('; ') };
  }

  revalidatePath('/security');
  revalidatePath('/settings/security');

  return { success: true, error: null };
}
