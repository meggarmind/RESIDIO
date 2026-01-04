'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  MAX_DOCUMENT_FILE_SIZE,
  DOCUMENT_FILE_EXTENSIONS,
} from '@/types/database';
import type { DocumentWithRelations } from '@/types/database';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';

type UploadDocumentResponse = {
  data: DocumentWithRelations | null;
  error: string | null;
};

/**
 * Validates the file before upload
 */
function validateFile(
  file: File
): { valid: boolean; error: string | null } {
  // Check file size
  if (file.size > MAX_DOCUMENT_FILE_SIZE) {
    return {
      valid: false,
      error: `File size exceeds maximum allowed (${MAX_DOCUMENT_FILE_SIZE / 1024 / 1024}MB)`,
    };
  }

  // Check MIME type
  if (!ALLOWED_DOCUMENT_MIME_TYPES.includes(file.type as typeof ALLOWED_DOCUMENT_MIME_TYPES[number])) {
    return {
      valid: false,
      error: 'File type not allowed. Please upload PDF, DOCX, XLSX, or TXT files.',
    };
  }

  return { valid: true, error: null };
}

/**
 * Generates a unique file path for storage
 */
function generateFilePath(fileName: string, mimeType: string): string {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 15);
  const extension = DOCUMENT_FILE_EXTENSIONS[mimeType] || '';
  const baseName = fileName.replace(/\.[^/.]+$/, ''); // Remove extension
  const safeName = baseName.replace(/[^a-zA-Z0-9-_]/g, '_'); // Sanitize
  return `${timestamp}-${randomId}-${safeName}${extension}`;
}

/**
 * Upload a new document
 */
export async function uploadDocument(formData: FormData): Promise<UploadDocumentResponse> {
  const supabase = await createServerSupabaseClient();

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { data: null, error: 'Not authenticated' };
  }

  // Permission check
  const auth = await authorizePermission(PERMISSIONS.DOCUMENTS_UPLOAD);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Unauthorized' };
  }

  // Extract form data
  const file = formData.get('file') as File;
  const title = formData.get('title') as string;
  const description = formData.get('description') as string | null;
  const categoryId = formData.get('category_id') as string | null;

  if (!file || !title) {
    return { data: null, error: 'File and title are required' };
  }

  // Validate file
  const validation = validateFile(file);
  if (!validation.valid) {
    return { data: null, error: validation.error };
  }

  // Generate storage path
  const filePath = generateFilePath(file.name, file.type);

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(filePath, file, {
      contentType: file.type,
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) {
    console.error('Storage upload error:', uploadError);
    return { data: null, error: `Upload failed: ${uploadError.message}` };
  }

  // Get file extension for file_type
  const fileType = file.name.split('.').pop()?.toLowerCase() || null;

  // Create document record
  const { data: document, error: insertError } = await supabase
    .from('documents')
    .insert({
      title,
      description: description || null,
      file_name: file.name,
      file_path: filePath,
      file_type: fileType,
      file_size_bytes: file.size,
      mime_type: file.type,
      category_id: categoryId || null,
      uploaded_by: user.id,
      version: 1,
    })
    .select(
      `
      *,
      category:document_categories(id, name, description, is_resident_accessible),
      uploader:profiles!uploaded_by(id, full_name)
    `
    )
    .single();

  if (insertError) {
    // Clean up uploaded file if database insert fails
    await supabase.storage.from('documents').remove([filePath]);
    console.error('Document insert error:', insertError);
    return { data: null, error: `Failed to create document record: ${insertError.message}` };
  }

  // Log the upload action (access log)
  await supabase.from('document_access_logs').insert({
    document_id: document.id,
    accessed_by: user.id,
    action: 'upload',
  });

  // Audit log
  await logAudit({
    action: 'CREATE',
    entityType: 'documents',
    entityId: document.id,
    entityDisplay: document.title,
    newValues: {
      title: document.title,
      file_name: document.file_name,
      file_type: document.file_type,
      file_size_bytes: document.file_size_bytes,
      category_id: categoryId,
      version: 1,
    },
    description: `Uploaded document: ${document.title}`,
  });

  return { data: document as DocumentWithRelations, error: null };
}

/**
 * Upload a new version of an existing document
 */
export async function uploadDocumentVersion(
  parentDocumentId: string,
  formData: FormData
): Promise<UploadDocumentResponse> {
  const supabase = await createServerSupabaseClient();

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { data: null, error: 'Not authenticated' };
  }

  // Permission check
  const auth = await authorizePermission(PERMISSIONS.DOCUMENTS_UPLOAD);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Unauthorized' };
  }

  // Get the parent document
  const { data: parentDoc, error: parentError } = await supabase
    .from('documents')
    .select('*')
    .eq('id', parentDocumentId)
    .single();

  if (parentError || !parentDoc) {
    return { data: null, error: 'Parent document not found' };
  }

  // Extract form data
  const file = formData.get('file') as File;
  const title = (formData.get('title') as string) || parentDoc.title;
  const description = formData.get('description') as string | null;

  if (!file) {
    return { data: null, error: 'File is required' };
  }

  // Validate file
  const validation = validateFile(file);
  if (!validation.valid) {
    return { data: null, error: validation.error };
  }

  // Get the current highest version number
  const { data: versions } = await supabase
    .from('documents')
    .select('version')
    .or(`id.eq.${parentDocumentId},parent_document_id.eq.${parentDocumentId}`)
    .order('version', { ascending: false })
    .limit(1);

  const nextVersion = (versions?.[0]?.version || 1) + 1;

  // Generate storage path
  const filePath = generateFilePath(file.name, file.type);

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(filePath, file, {
      contentType: file.type,
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) {
    console.error('Storage upload error:', uploadError);
    return { data: null, error: `Upload failed: ${uploadError.message}` };
  }

  const fileType = file.name.split('.').pop()?.toLowerCase() || null;

  // Create new version record
  const { data: document, error: insertError } = await supabase
    .from('documents')
    .insert({
      title,
      description: description ?? parentDoc.description,
      file_name: file.name,
      file_path: filePath,
      file_type: fileType,
      file_size_bytes: file.size,
      mime_type: file.type,
      category_id: parentDoc.category_id,
      uploaded_by: user.id,
      version: nextVersion,
      parent_document_id: parentDocumentId,
    })
    .select(
      `
      *,
      category:document_categories(id, name, description, is_resident_accessible),
      uploader:profiles!uploaded_by(id, full_name)
    `
    )
    .single();

  if (insertError) {
    await supabase.storage.from('documents').remove([filePath]);
    console.error('Document version insert error:', insertError);
    return { data: null, error: `Failed to create document version: ${insertError.message}` };
  }

  // Log the upload action (access log)
  await supabase.from('document_access_logs').insert({
    document_id: document.id,
    accessed_by: user.id,
    action: 'upload',
  });

  // Audit log
  await logAudit({
    action: 'CREATE',
    entityType: 'documents',
    entityId: document.id,
    entityDisplay: `${document.title} (v${nextVersion})`,
    newValues: {
      title: document.title,
      file_name: document.file_name,
      file_type: fileType,
      file_size_bytes: document.file_size_bytes,
      parent_document_id: parentDocumentId,
      version: nextVersion,
    },
    description: `Uploaded new version (v${nextVersion}) of: ${parentDoc.title}`,
  });

  return { data: document as DocumentWithRelations, error: null };
}
