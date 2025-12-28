'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { DocumentWithRelations, Document } from '@/types/database';

type GetDocumentResponse = {
  data: DocumentWithRelations | null;
  error: string | null;
};

type GetVersionsResponse = {
  data: Document[];
  error: string | null;
};

/**
 * Get a single document by ID with all relations
 */
export async function getDocument(id: string): Promise<GetDocumentResponse> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('documents')
    .select(
      `
      *,
      category:document_categories(id, name, description, is_resident_accessible),
      uploader:profiles!uploaded_by(id, full_name),
      resident:residents(id, first_name, last_name),
      house:houses(id, unit_number, street:streets(name))
    `
    )
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching document:', error);
    return { data: null, error: error.message };
  }

  // Transform resident data
  const transformedData = {
    ...data,
    resident: data.resident
      ? {
          id: data.resident.id,
          full_name: `${data.resident.first_name} ${data.resident.last_name}`,
        }
      : null,
  } as DocumentWithRelations;

  return { data: transformedData, error: null };
}

/**
 * Get version history for a document
 * Returns all versions including the original and all subsequent versions
 */
export async function getDocumentVersions(documentId: string): Promise<GetVersionsResponse> {
  const supabase = await createServerSupabaseClient();

  // First, get the document to find the root document ID
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .select('id, parent_document_id')
    .eq('id', documentId)
    .single();

  if (docError || !doc) {
    return { data: [], error: docError?.message || 'Document not found' };
  }

  // Find the root document (the one with no parent)
  let rootId = doc.id;
  if (doc.parent_document_id) {
    // This is a version, find the root
    const { data: rootDoc } = await supabase
      .from('documents')
      .select('id')
      .eq('id', doc.parent_document_id)
      .is('parent_document_id', null)
      .single();

    if (rootDoc) {
      rootId = rootDoc.id;
    }
  }

  // Get all versions: the root document and all documents that reference it
  const { data: versions, error } = await supabase
    .from('documents')
    .select('*')
    .or(`id.eq.${rootId},parent_document_id.eq.${rootId}`)
    .order('version', { ascending: false });

  if (error) {
    console.error('Error fetching document versions:', error);
    return { data: [], error: error.message };
  }

  return { data: versions as Document[], error: null };
}

/**
 * Get the latest version of a document
 */
export async function getLatestDocumentVersion(documentId: string): Promise<GetDocumentResponse> {
  const supabase = await createServerSupabaseClient();

  // First check if this document has newer versions
  const { data: newerVersions, error: versionError } = await supabase
    .from('documents')
    .select('id')
    .eq('parent_document_id', documentId)
    .order('version', { ascending: false })
    .limit(1);

  if (versionError) {
    console.error('Error checking for newer versions:', versionError);
    return { data: null, error: versionError.message };
  }

  // If there are newer versions, get the latest one recursively
  if (newerVersions && newerVersions.length > 0) {
    return getLatestDocumentVersion(newerVersions[0].id);
  }

  // This is the latest version, return it
  return getDocument(documentId);
}
