'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { sanitizeSearchInput } from '@/lib/utils';
import type { DocumentWithRelations, DocumentListParams } from '@/types/database';

type GetDocumentsResponse = {
  data: DocumentWithRelations[];
  count: number;
  error: string | null;
};

/**
 * Get documents with optional filtering, search, and pagination
 */
export async function getDocuments(
  params: DocumentListParams = {}
): Promise<GetDocumentsResponse> {
  const supabase = await createServerSupabaseClient();
  const {
    category_id,
    search,
    is_archived = false,
    uploaded_by,
    from_date,
    to_date,
    page = 1,
    limit = 20,
  } = params;

  let query = supabase
    .from('documents')
    .select(
      `
      *,
      category:document_categories(id, name, description, is_resident_accessible),
      uploader:profiles!uploaded_by(id, full_name),
      resident:residents(id, first_name, last_name),
      house:houses(id, unit_number, street:streets(name))
    `,
      { count: 'exact' }
    );

  // Apply filters
  query = query.eq('is_archived', is_archived);

  if (category_id) {
    query = query.eq('category_id', category_id);
  }

  if (uploaded_by) {
    query = query.eq('uploaded_by', uploaded_by);
  }

  if (from_date) {
    query = query.gte('created_at', from_date);
  }

  if (to_date) {
    query = query.lte('created_at', to_date);
  }

  // Full-text search on title and description
  if (search) {
    const sanitized = sanitizeSearchInput(search);
    query = query.or(
      `title.ilike.%${sanitized}%,description.ilike.%${sanitized}%,file_name.ilike.%${sanitized}%`
    );
  }

  // Only get latest versions (no parent_document_id means it's the original or latest)
  // For version history, we query by parent_document_id separately
  query = query.is('parent_document_id', null);

  // Pagination
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  query = query.range(from, to).order('created_at', { ascending: false });

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching documents:', error);
    return { data: [], count: 0, error: error.message };
  }

  // Transform data to match DocumentWithRelations type
  const transformedData = (data ?? []).map((doc) => ({
    ...doc,
    resident: doc.resident
      ? {
          id: doc.resident.id,
          full_name: `${doc.resident.first_name} ${doc.resident.last_name}`,
        }
      : null,
  })) as DocumentWithRelations[];

  return {
    data: transformedData,
    count: count ?? 0,
    error: null,
  };
}

/**
 * Get documents accessible to residents (filtered by category accessibility)
 */
export async function getResidentAccessibleDocuments(
  params: Omit<DocumentListParams, 'is_archived' | 'uploaded_by'> = {}
): Promise<GetDocumentsResponse> {
  const supabase = await createServerSupabaseClient();
  const { category_id, search, from_date, to_date, page = 1, limit = 20 } = params;

  // First, get accessible category IDs
  const { data: accessibleCategories } = await supabase
    .from('document_categories')
    .select('id')
    .eq('is_resident_accessible', true)
    .eq('is_active', true);

  const accessibleCategoryIds = (accessibleCategories ?? []).map((c) => c.id);

  if (accessibleCategoryIds.length === 0) {
    return { data: [], count: 0, error: null };
  }

  let query = supabase
    .from('documents')
    .select(
      `
      *,
      category:document_categories(id, name, description, is_resident_accessible),
      uploader:profiles!uploaded_by(id, full_name)
    `,
      { count: 'exact' }
    )
    .eq('is_archived', false)
    .is('parent_document_id', null)
    .in('category_id', accessibleCategoryIds);

  if (category_id && accessibleCategoryIds.includes(category_id)) {
    query = query.eq('category_id', category_id);
  }

  if (from_date) {
    query = query.gte('created_at', from_date);
  }

  if (to_date) {
    query = query.lte('created_at', to_date);
  }

  if (search) {
    const sanitized = sanitizeSearchInput(search);
    query = query.or(
      `title.ilike.%${sanitized}%,description.ilike.%${sanitized}%`
    );
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  query = query.range(from, to).order('created_at', { ascending: false });

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching resident documents:', error);
    return { data: [], count: 0, error: error.message };
  }

  return {
    data: (data ?? []) as DocumentWithRelations[],
    count: count ?? 0,
    error: null,
  };
}
