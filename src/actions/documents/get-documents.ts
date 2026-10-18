'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  rankDocuments,
  searchDocuments,
  DOCUMENT_SEARCH_CAP,
  type DocumentSearchQuery,
} from '@/lib/documents/search';
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

  const buildQuery = () => {
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

    // Only get latest versions (no parent_document_id means it's the original or latest)
    // For version history, we query by parent_document_id separately
    return query.is('parent_document_id', null).order('created_at', { ascending: false });
  };

  // Pagination
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, error, count } = search
    ? await searchPage(buildQuery, search, ['title', 'description', 'file_name'], from, to)
    : await buildQuery().range(from, to);

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

  const buildQuery = () => {
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

    return query.order('created_at', { ascending: false });
  };

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, error, count } = search
    ? await searchPage(buildQuery, search, ['title', 'description'], from, to)
    : await buildQuery().range(from, to);

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

/**
 * Full-text search, ranked, then paged. Ranking needs every match, so the page
 * is cut here rather than by `.range()`; `count` is capped to what was ranked.
 */
async function searchPage<R extends { title: string }>(
  build: () => DocumentSearchQuery<R>,
  search: string,
  fallbackColumns: string[],
  from: number,
  to: number
) {
  const { data, error, count } = await searchDocuments(build, search, fallbackColumns);
  return {
    data: rankDocuments(data ?? [], search).slice(from, to + 1),
    error,
    count: Math.min(count ?? 0, DOCUMENT_SEARCH_CAP),
  };
}
