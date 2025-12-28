'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';

type DownloadUrlResponse = {
  url: string | null;
  error: string | null;
};

/**
 * Generate a signed download URL for a document
 * The URL expires after 1 hour
 */
export async function getDocumentDownloadUrl(
  documentId: string
): Promise<DownloadUrlResponse> {
  const supabase = await createServerSupabaseClient();

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { url: null, error: 'Not authenticated' };
  }

  // Get the document
  const { data: document, error: docError } = await supabase
    .from('documents')
    .select('id, file_path, file_name')
    .eq('id', documentId)
    .single();

  if (docError || !document) {
    return { url: null, error: 'Document not found' };
  }

  // Generate signed URL (expires in 1 hour)
  const { data: signedUrl, error: urlError } = await supabase.storage
    .from('documents')
    .createSignedUrl(document.file_path, 3600, {
      download: document.file_name, // Forces download with original filename
    });

  if (urlError || !signedUrl) {
    console.error('Error generating signed URL:', urlError);
    return { url: null, error: 'Failed to generate download URL' };
  }

  // Log the download action
  await supabase.from('document_access_logs').insert({
    document_id: documentId,
    accessed_by: user.id,
    action: 'download',
  });

  return { url: signedUrl.signedUrl, error: null };
}

/**
 * Generate a signed view URL for a document (inline viewing, not download)
 * The URL expires after 1 hour
 */
export async function getDocumentViewUrl(
  documentId: string
): Promise<DownloadUrlResponse> {
  const supabase = await createServerSupabaseClient();

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { url: null, error: 'Not authenticated' };
  }

  // Get the document
  const { data: document, error: docError } = await supabase
    .from('documents')
    .select('id, file_path')
    .eq('id', documentId)
    .single();

  if (docError || !document) {
    return { url: null, error: 'Document not found' };
  }

  // Generate signed URL without download option (for inline viewing)
  const { data: signedUrl, error: urlError } = await supabase.storage
    .from('documents')
    .createSignedUrl(document.file_path, 3600);

  if (urlError || !signedUrl) {
    console.error('Error generating signed URL:', urlError);
    return { url: null, error: 'Failed to generate view URL' };
  }

  // Log the view action
  await supabase.from('document_access_logs').insert({
    document_id: documentId,
    accessed_by: user.id,
    action: 'view',
  });

  return { url: signedUrl.signedUrl, error: null };
}

/**
 * Get multiple download URLs at once (for bulk download)
 */
export async function getDocumentDownloadUrls(
  documentIds: string[]
): Promise<{ urls: Record<string, string>; errors: Record<string, string> }> {
  const urls: Record<string, string> = {};
  const errors: Record<string, string> = {};

  await Promise.all(
    documentIds.map(async (id) => {
      const result = await getDocumentDownloadUrl(id);
      if (result.url) {
        urls[id] = result.url;
      } else {
        errors[id] = result.error || 'Failed to generate URL';
      }
    })
  );

  return { urls, errors };
}
