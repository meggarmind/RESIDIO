'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';

type DeleteDocumentResponse = {
  success: boolean;
  error: string | null;
};

/**
 * Permanently delete a document and its file from storage
 * Also deletes all versions of the document
 */
export async function deleteDocument(id: string): Promise<DeleteDocumentResponse> {
  const supabase = await createServerSupabaseClient();

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Permission check
  const auth = await authorizePermission(PERMISSIONS.DOCUMENTS_DELETE);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  // Get the document to find the file path (include title for audit log)
  const { data: document, error: docError } = await supabase
    .from('documents')
    .select('id, title, file_path, file_name, parent_document_id, version')
    .eq('id', id)
    .single();

  if (docError || !document) {
    return { success: false, error: 'Document not found' };
  }

  // Check if this is a parent document with versions
  // If so, we need to delete all versions too
  const filesToDelete: string[] = [document.file_path];
  const documentIdsToDelete: string[] = [id];

  // Get all versions if this is a parent document
  if (!document.parent_document_id) {
    const { data: versions } = await supabase
      .from('documents')
      .select('id, file_path')
      .eq('parent_document_id', id);

    if (versions && versions.length > 0) {
      versions.forEach((v) => {
        filesToDelete.push(v.file_path);
        documentIdsToDelete.push(v.id);
      });
    }
  }

  // Log the delete action before deletion (for audit trail)
  await supabase.from('document_access_logs').insert({
    document_id: id,
    accessed_by: user.id,
    action: 'delete',
  });

  // Delete files from storage
  const { error: storageError } = await supabase.storage
    .from('documents')
    .remove(filesToDelete);

  if (storageError) {
    console.error('Storage delete error:', storageError);
    // Continue with database deletion even if storage delete fails
    // Files can be cleaned up later
  }

  // Delete document records
  // Access logs will be cascade deleted due to foreign key
  const { error: deleteError } = await supabase
    .from('documents')
    .delete()
    .in('id', documentIdsToDelete);

  if (deleteError) {
    console.error('Document delete error:', deleteError);
    return { success: false, error: deleteError.message };
  }

  // Audit log
  const versionsDeleted = documentIdsToDelete.length - 1;
  await logAudit({
    action: 'DELETE',
    entityType: 'documents',
    entityId: id,
    entityDisplay: document.title,
    oldValues: {
      title: document.title,
      file_name: document.file_name,
      versions_deleted: versionsDeleted > 0 ? versionsDeleted : undefined,
    },
    description: versionsDeleted > 0
      ? `Deleted document "${document.title}" and ${versionsDeleted} version(s)`
      : `Deleted document: ${document.title}`,
  });

  return { success: true, error: null };
}

/**
 * Delete a specific version of a document
 * Cannot delete the original (parent) document if it has versions
 */
export async function deleteDocumentVersion(id: string): Promise<DeleteDocumentResponse> {
  const supabase = await createServerSupabaseClient();

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Permission check
  const auth = await authorizePermission(PERMISSIONS.DOCUMENTS_DELETE);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  // Get the document (include title and version for audit log)
  const { data: document, error: docError } = await supabase
    .from('documents')
    .select('id, title, file_path, file_name, parent_document_id, version')
    .eq('id', id)
    .single();

  if (docError || !document) {
    return { success: false, error: 'Document not found' };
  }

  // If this is the parent document, check for versions
  if (!document.parent_document_id) {
    const { data: versions } = await supabase
      .from('documents')
      .select('id')
      .eq('parent_document_id', id)
      .limit(1);

    if (versions && versions.length > 0) {
      return {
        success: false,
        error: 'Cannot delete parent document while versions exist. Delete versions first or use deleteDocument to delete all.',
      };
    }
  }

  // Log the delete action
  await supabase.from('document_access_logs').insert({
    document_id: id,
    accessed_by: user.id,
    action: 'delete',
  });

  // Delete file from storage
  await supabase.storage.from('documents').remove([document.file_path]);

  // Delete document record
  const { error: deleteError } = await supabase
    .from('documents')
    .delete()
    .eq('id', id);

  if (deleteError) {
    console.error('Document version delete error:', deleteError);
    return { success: false, error: deleteError.message };
  }

  // Audit log
  await logAudit({
    action: 'DELETE',
    entityType: 'documents',
    entityId: id,
    entityDisplay: `${document.title} (v${document.version})`,
    oldValues: {
      title: document.title,
      file_name: document.file_name,
      version: document.version,
      parent_document_id: document.parent_document_id,
    },
    description: `Deleted version ${document.version} of: ${document.title}`,
  });

  return { success: true, error: null };
}
