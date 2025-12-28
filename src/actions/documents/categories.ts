'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { DocumentCategory } from '@/types/database';

type GetCategoriesResponse = {
  data: DocumentCategory[];
  error: string | null;
};

type CategoryResponse = {
  data: DocumentCategory | null;
  error: string | null;
};

/**
 * Get all active document categories
 * @param includeInactive - Include inactive categories (for admin management)
 */
export async function getDocumentCategories(
  includeInactive = false
): Promise<GetCategoriesResponse> {
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from('document_categories')
    .select('*')
    .order('display_order', { ascending: true });

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching document categories:', error);
    return { data: [], error: error.message };
  }

  return { data: data as DocumentCategory[], error: null };
}

/**
 * Get a single document category by ID
 */
export async function getDocumentCategory(id: string): Promise<CategoryResponse> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('document_categories')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching document category:', error);
    return { data: null, error: error.message };
  }

  return { data: data as DocumentCategory, error: null };
}

/**
 * Create a new document category
 */
export async function createDocumentCategory(input: {
  name: string;
  description?: string;
  is_resident_accessible?: boolean;
  display_order?: number;
}): Promise<CategoryResponse> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('document_categories')
    .insert({
      name: input.name,
      description: input.description || null,
      is_resident_accessible: input.is_resident_accessible ?? false,
      display_order: input.display_order ?? 0,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating document category:', error);
    return { data: null, error: error.message };
  }

  return { data: data as DocumentCategory, error: null };
}

/**
 * Update an existing document category
 */
export async function updateDocumentCategory(
  id: string,
  input: {
    name?: string;
    description?: string | null;
    is_resident_accessible?: boolean;
    is_active?: boolean;
    display_order?: number;
  }
): Promise<CategoryResponse> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('document_categories')
    .update(input)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating document category:', error);
    return { data: null, error: error.message };
  }

  return { data: data as DocumentCategory, error: null };
}

/**
 * Delete a document category (soft delete by setting is_active to false)
 */
export async function deleteDocumentCategory(id: string): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  // Soft delete - set is_active to false
  const { error } = await supabase
    .from('document_categories')
    .update({ is_active: false })
    .eq('id', id);

  if (error) {
    console.error('Error deleting document category:', error);
    return { success: false, error: error.message };
  }

  return { success: true, error: null };
}
