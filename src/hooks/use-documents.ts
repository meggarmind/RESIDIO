'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getDocuments,
  getResidentAccessibleDocuments,
} from '@/actions/documents/get-documents';
import { getDocument, getDocumentVersions } from '@/actions/documents/get-document';
import { uploadDocument, uploadDocumentVersion } from '@/actions/documents/upload-document';
import { updateDocument, archiveDocument, restoreDocument } from '@/actions/documents/update-document';
import { deleteDocument, deleteDocumentVersion } from '@/actions/documents/delete-document';
import { getDocumentDownloadUrl, getDocumentViewUrl } from '@/actions/documents/download-document';
import {
  getDocumentCategories,
  getDocumentCategory,
  createDocumentCategory,
  updateDocumentCategory,
  deleteDocumentCategory,
} from '@/actions/documents/categories';
import type { DocumentListParams, DocumentUpdateInput } from '@/types/database';

// =====================================================
// Document Queries
// =====================================================

/**
 * Fetch documents with optional filtering and pagination
 */
export function useDocuments(params: DocumentListParams = {}) {
  return useQuery({
    queryKey: ['documents', params],
    queryFn: async () => {
      const result = await getDocuments(params);
      if (result.error) throw new Error(result.error);
      return { data: result.data, count: result.count };
    },
  });
}

/**
 * Fetch documents accessible to residents (filtered by category)
 */
export function useResidentDocuments(
  params: Omit<DocumentListParams, 'is_archived' | 'uploaded_by'> = {}
) {
  return useQuery({
    queryKey: ['residentDocuments', params],
    queryFn: async () => {
      const result = await getResidentAccessibleDocuments(params);
      if (result.error) throw new Error(result.error);
      return { data: result.data, count: result.count };
    },
  });
}

/**
 * Fetch a single document by ID
 */
export function useDocument(id: string | undefined) {
  return useQuery({
    queryKey: ['document', id],
    queryFn: async () => {
      if (!id) throw new Error('Document ID is required');
      const result = await getDocument(id);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    enabled: !!id,
  });
}

/**
 * Fetch version history for a document
 */
export function useDocumentVersions(documentId: string | undefined) {
  return useQuery({
    queryKey: ['documentVersions', documentId],
    queryFn: async () => {
      if (!documentId) throw new Error('Document ID is required');
      const result = await getDocumentVersions(documentId);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    enabled: !!documentId,
  });
}

// =====================================================
// Document Mutations
// =====================================================

/**
 * Upload a new document
 */
export function useUploadDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (formData: FormData) => {
      const result = await uploadDocument(formData);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['residentDocuments'] });
    },
  });
}

/**
 * Upload a new version of an existing document
 */
export function useUploadDocumentVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      parentDocumentId,
      formData,
    }: {
      parentDocumentId: string;
      formData: FormData;
    }) => {
      const result = await uploadDocumentVersion(parentDocumentId, formData);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['residentDocuments'] });
      queryClient.invalidateQueries({ queryKey: ['document', variables.parentDocumentId] });
      queryClient.invalidateQueries({ queryKey: ['documentVersions', variables.parentDocumentId] });
    },
  });
}

/**
 * Update document metadata
 */
export function useUpdateDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: DocumentUpdateInput }) => {
      const result = await updateDocument(id, data);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['residentDocuments'] });
      queryClient.invalidateQueries({ queryKey: ['document', variables.id] });
    },
  });
}

/**
 * Archive a document (soft delete)
 */
export function useArchiveDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await archiveDocument(id);
      if (result.error) throw new Error(result.error);
      return result.success;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['residentDocuments'] });
      queryClient.invalidateQueries({ queryKey: ['document', id] });
    },
  });
}

/**
 * Restore an archived document
 */
export function useRestoreDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await restoreDocument(id);
      if (result.error) throw new Error(result.error);
      return result.success;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['document', id] });
    },
  });
}

/**
 * Permanently delete a document and all versions
 */
export function useDeleteDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteDocument(id);
      if (result.error) throw new Error(result.error);
      return result.success;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['residentDocuments'] });
    },
  });
}

/**
 * Delete a specific document version
 */
export function useDeleteDocumentVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteDocumentVersion(id);
      if (result.error) throw new Error(result.error);
      return result.success;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['documentVersions'] });
    },
  });
}

// =====================================================
// Download URLs
// =====================================================

/**
 * Get a download URL for a document
 */
export function useDocumentDownloadUrl(documentId: string | undefined) {
  return useQuery({
    queryKey: ['documentDownloadUrl', documentId],
    queryFn: async () => {
      if (!documentId) throw new Error('Document ID is required');
      const result = await getDocumentDownloadUrl(documentId);
      if (result.error) throw new Error(result.error);
      return result.url;
    },
    enabled: !!documentId,
    staleTime: 30 * 60 * 1000, // 30 minutes (URL is valid for 1 hour)
  });
}

/**
 * Get a view URL for a document (for inline preview)
 */
export function useDocumentViewUrl(documentId: string | undefined) {
  return useQuery({
    queryKey: ['documentViewUrl', documentId],
    queryFn: async () => {
      if (!documentId) throw new Error('Document ID is required');
      const result = await getDocumentViewUrl(documentId);
      if (result.error) throw new Error(result.error);
      return result.url;
    },
    enabled: !!documentId,
    staleTime: 30 * 60 * 1000, // 30 minutes
  });
}

// =====================================================
// Category Queries and Mutations
// =====================================================

/**
 * Fetch all document categories
 */
export function useDocumentCategories(includeInactive = false) {
  return useQuery({
    queryKey: ['documentCategories', { includeInactive }],
    queryFn: async () => {
      const result = await getDocumentCategories(includeInactive);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
  });
}

/**
 * Fetch a single document category
 */
export function useDocumentCategory(id: string | undefined) {
  return useQuery({
    queryKey: ['documentCategory', id],
    queryFn: async () => {
      if (!id) throw new Error('Category ID is required');
      const result = await getDocumentCategory(id);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    enabled: !!id,
  });
}

/**
 * Create a new document category
 */
export function useCreateDocumentCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      name: string;
      description?: string;
      is_resident_accessible?: boolean;
      display_order?: number;
    }) => {
      const result = await createDocumentCategory(data);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documentCategories'] });
    },
  });
}

/**
 * Update a document category
 */
export function useUpdateDocumentCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: {
        name?: string;
        description?: string | null;
        is_resident_accessible?: boolean;
        is_active?: boolean;
        display_order?: number;
      };
    }) => {
      const result = await updateDocumentCategory(id, data);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['documentCategories'] });
      queryClient.invalidateQueries({ queryKey: ['documentCategory', variables.id] });
    },
  });
}

/**
 * Delete a document category (soft delete)
 */
export function useDeleteDocumentCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteDocumentCategory(id);
      if (result.error) throw new Error(result.error);
      return result.success;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documentCategories'] });
    },
  });
}
