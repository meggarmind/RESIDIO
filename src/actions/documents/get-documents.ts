'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  rankDocuments,
  searchDocuments,
  DOCUMENT_SEARCH_CAP,
  type DocumentSearchQuery,
} from '@/lib/documents/search';
import { tagWithDescendants } from '@/lib/documents/taxonomy';
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
    tag_id,
    search,
    is_archived = false,
    uploaded_by,
    from_date,
    to_date,
    page = 1,
    limit = 20,
  } = params;

  let taggedIds: string[] | null = null;
  if (tag_id) {
    const tagged = await documentIdsTagged(supabase, tag_id);
    if (tagged.error) {
      console.error('Error filtering documents by tag:', tagged.error);
      return { data: [], count: 0, error: tagged.error.message };
    }
    if (tagged.ids.length === 0) return { data: [], count: 0, error: null };
    taggedIds = tagged.ids;
  }

  const buildQuery = () => {
    let query = supabase
      .from('documents')
      .select(
        `
        *,
        category:document_categories(id, name, description, is_resident_accessible),
        uploader:profiles!uploaded_by(id, full_name),
        resident:residents(id, first_name, last_name),
        house:houses(id, unit_number, street:streets(name)),
        tag_assignments:document_tag_assignments(tag:document_tags(id, name, color, is_active))
      `,
        { count: 'exact' }
      );

    // Apply filters
    query = query.eq('is_archived', is_archived);

    if (category_id) {
      query = query.eq('category_id', category_id);
    }

    if (taggedIds) {
      // shortcut: ids travel in the URL, fine for an estate library; move to an RPC or inner-join filter past ~1,000 tagged documents.
      query = query.in('id', taggedIds);
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
  const transformedData = (data ?? []).map(({ tag_assignments, ...doc }) => ({
    ...doc,
    tags: activeTags(tag_assignments),
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

type TagAssignmentRow = { tag: { id: string; name: string; color: string; is_active: boolean } | null };

/** Chips show active tags only; an inactive tag stays assigned but hidden until reactivated. */
function activeTags(assignments: TagAssignmentRow[] | null | undefined) {
  return (assignments ?? [])
    .map((a) => a.tag)
    .filter((t): t is NonNullable<TagAssignmentRow['tag']> => !!t && t.is_active)
    .map(({ id, name, color }) => ({ id, name, color }));
}

/**
 * Ids of documents carrying the tag or any tag nested under it: filtering by a parent tag finds
 * documents tagged with its children (#382).
 */
async function documentIdsTagged(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, tagId: string) {
  const { data: tags, error: tagsError } = await supabase.from('document_tags').select('id, parent_tag_id');
  if (tagsError) return { ids: [], error: tagsError };

  const { data, error } = await supabase
    .from('document_tag_assignments')
    .select('document_id')
    .in('tag_id', tagWithDescendants(tags ?? [], tagId));
  if (error) return { ids: [], error };

  return { ids: [...new Set((data ?? []).map((a) => a.document_id as string))], error: null };
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
