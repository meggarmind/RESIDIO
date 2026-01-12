'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAnnouncements,
  getPublishedAnnouncements,
  getAnnouncement,
  getAnnouncementReadStats,
} from '@/actions/announcements/get-announcements';
import { createAnnouncement, createAnnouncementFromTemplate } from '@/actions/announcements/create-announcement';
import { updateAnnouncement, archiveAnnouncement } from '@/actions/announcements/update-announcement';
import { deleteAnnouncement } from '@/actions/announcements/delete-announcement';
import {
  publishAnnouncement,
  scheduleAnnouncement,
  unpublishAnnouncement,
} from '@/actions/announcements/publish-announcement';
import {
  getAnnouncementCategories,
  getAllAnnouncementCategories,
  createAnnouncementCategory,
  updateAnnouncementCategory,
  deleteAnnouncementCategory,
} from '@/actions/announcements/categories';
import {
  getMessageTemplates,
  getAllMessageTemplates,
  getMessageTemplate,
  createMessageTemplate,
  updateMessageTemplate,
  deleteMessageTemplate,
} from '@/actions/announcements/templates';
import {
  markAnnouncementAsRead,
  hasReadAnnouncement,
  getReadStatusBatch,
} from '@/actions/announcements/read-receipts';
import {
  sendEmergencyBroadcast,
  type EmergencyBroadcastInput,
} from '@/actions/announcements/emergency-broadcast';
import type { AnnouncementListParams, AnnouncementInput } from '@/types/database';

// =====================================================
// Announcement Queries
// =====================================================

/**
 * Fetch announcements with optional filtering and pagination
 */
export function useAnnouncements(params: AnnouncementListParams = {}) {
  return useQuery({
    queryKey: ['announcements', params],
    queryFn: async () => {
      const result = await getAnnouncements(params);
      if (result.error) throw new Error(result.error);
      return { data: result.data, count: result.count };
    },
  });
}

/**
 * Fetch published announcements for portal display
 */
export function usePublishedAnnouncements({
  category,
  limit = 10,
}: {
  category?: string;
  limit?: number;
} = {}) {
  return useQuery({
    queryKey: ['publishedAnnouncements', { category, limit }],
    queryFn: async () => {
      const result = await getPublishedAnnouncements({ category, limit });
      if (result.error) throw new Error(result.error);
      return result.data;
    },
  });
}

/**
 * Fetch a single announcement by ID
 */
export function useAnnouncement(id: string | undefined) {
  return useQuery({
    queryKey: ['announcement', id],
    queryFn: async () => {
      if (!id) throw new Error('Announcement ID is required');
      const result = await getAnnouncement(id);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    enabled: !!id,
  });
}

/**
 * Fetch read statistics for an announcement
 */
export function useAnnouncementReadStats(announcementId: string | undefined) {
  return useQuery({
    queryKey: ['announcementReadStats', announcementId],
    queryFn: async () => {
      if (!announcementId) throw new Error('Announcement ID is required');
      const result = await getAnnouncementReadStats(announcementId);
      if (result.error) throw new Error(result.error);
      return result;
    },
    enabled: !!announcementId,
  });
}

/**
 * Check if current user has read a specific announcement
 */
export function useHasReadAnnouncement(announcementId: string | undefined) {
  return useQuery({
    queryKey: ['hasReadAnnouncement', announcementId],
    queryFn: async () => {
      if (!announcementId) throw new Error('Announcement ID is required');
      const result = await hasReadAnnouncement(announcementId);
      if (result.error) throw new Error(result.error);
      return { hasRead: result.hasRead, readAt: result.readAt };
    },
    enabled: !!announcementId,
  });
}

/**
 * Get read status for multiple announcements (batch)
 */
export function useReadStatusBatch(announcementIds: string[]) {
  return useQuery({
    queryKey: ['readStatusBatch', announcementIds],
    queryFn: async () => {
      const result = await getReadStatusBatch(announcementIds);
      if (result.error) throw new Error(result.error);
      return result.readStatus;
    },
    enabled: announcementIds.length > 0,
  });
}

// =====================================================
// Announcement Mutations
// =====================================================

/**
 * Create a new announcement
 */
export function useCreateAnnouncement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: AnnouncementInput) => {
      const result = await createAnnouncement(data);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      queryClient.invalidateQueries({ queryKey: ['publishedAnnouncements'] });
    },
  });
}

/**
 * Create announcement from a template
 */
export function useCreateAnnouncementFromTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      templateId,
      variables,
      overrides,
    }: {
      templateId: string;
      variables: Record<string, string>;
      overrides?: Partial<AnnouncementInput>;
    }) => {
      const result = await createAnnouncementFromTemplate(templateId, variables, overrides);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
    },
  });
}

/**
 * Update an announcement
 */
export function useUpdateAnnouncement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<AnnouncementInput> }) => {
      const result = await updateAnnouncement(id, data);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      queryClient.invalidateQueries({ queryKey: ['publishedAnnouncements'] });
      queryClient.invalidateQueries({ queryKey: ['announcement', variables.id] });
    },
  });
}

/**
 * Publish an announcement immediately
 */
export function usePublishAnnouncement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await publishAnnouncement(id);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      queryClient.invalidateQueries({ queryKey: ['publishedAnnouncements'] });
      queryClient.invalidateQueries({ queryKey: ['announcement', id] });
    },
  });
}

/**
 * Schedule an announcement for future publication
 */
export function useScheduleAnnouncement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, scheduledFor }: { id: string; scheduledFor: Date | string }) => {
      // Convert Date to ISO string if needed
      const scheduledForStr =
        scheduledFor instanceof Date ? scheduledFor.toISOString() : scheduledFor;
      const result = await scheduleAnnouncement(id, scheduledForStr);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      queryClient.invalidateQueries({ queryKey: ['announcement', variables.id] });
    },
  });
}

/**
 * Unpublish an announcement (revert to draft)
 */
export function useUnpublishAnnouncement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await unpublishAnnouncement(id);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      queryClient.invalidateQueries({ queryKey: ['publishedAnnouncements'] });
      queryClient.invalidateQueries({ queryKey: ['announcement', id] });
    },
  });
}

/**
 * Archive an announcement
 */
export function useArchiveAnnouncement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await archiveAnnouncement(id);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      queryClient.invalidateQueries({ queryKey: ['publishedAnnouncements'] });
      queryClient.invalidateQueries({ queryKey: ['announcement', id] });
    },
  });
}

/**
 * Delete an announcement (draft only)
 */
export function useDeleteAnnouncement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteAnnouncement(id);
      if (result.error) throw new Error(result.error);
      return result.success;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
    },
  });
}

/**
 * Mark an announcement as read by current user
 */
export function useMarkAnnouncementAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (announcementId: string) => {
      const result = await markAnnouncementAsRead(announcementId);
      if (result.error) throw new Error(result.error);
      return result.success;
    },
    onSuccess: (_, announcementId) => {
      queryClient.invalidateQueries({ queryKey: ['hasReadAnnouncement', announcementId] });
      queryClient.invalidateQueries({ queryKey: ['readStatusBatch'] });
      queryClient.invalidateQueries({ queryKey: ['announcementReadStats', announcementId] });
    },
  });
}

// =====================================================
// Category Queries and Mutations
// =====================================================

/**
 * Fetch active announcement categories
 */
export function useAnnouncementCategories() {
  return useQuery({
    queryKey: ['announcementCategories'],
    queryFn: async () => {
      const result = await getAnnouncementCategories();
      if (result.error) throw new Error(result.error);
      return result.data;
    },
  });
}

/**
 * Fetch all announcement categories (including inactive)
 */
export function useAllAnnouncementCategories() {
  return useQuery({
    queryKey: ['announcementCategories', 'all'],
    queryFn: async () => {
      const result = await getAllAnnouncementCategories();
      if (result.error) throw new Error(result.error);
      return result.data;
    },
  });
}

/**
 * Create a new announcement category
 */
export function useCreateAnnouncementCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      name: string;
      slug: string;
      description?: string;
      icon?: string;
      color?: string;
      display_order?: number;
    }) => {
      const result = await createAnnouncementCategory(data);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcementCategories'] });
    },
  });
}

/**
 * Update an announcement category
 */
export function useUpdateAnnouncementCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{
        name: string;
        slug: string;
        description: string;
        icon: string;
        color: string;
        is_active: boolean;
        display_order: number;
      }>;
    }) => {
      const result = await updateAnnouncementCategory(id, data);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcementCategories'] });
    },
  });
}

/**
 * Delete an announcement category (soft delete)
 */
export function useDeleteAnnouncementCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteAnnouncementCategory(id);
      if (result.error) throw new Error(result.error);
      return result.success;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcementCategories'] });
    },
  });
}

// =====================================================
// Message Template Queries and Mutations
// =====================================================

/**
 * Fetch active message templates
 */
export function useMessageTemplates(categoryId?: string) {
  return useQuery({
    queryKey: ['messageTemplates', { categoryId }],
    queryFn: async () => {
      const result = await getMessageTemplates(categoryId);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
  });
}

/**
 * Fetch all message templates (including inactive)
 */
export function useAllMessageTemplates() {
  return useQuery({
    queryKey: ['messageTemplates', 'all'],
    queryFn: async () => {
      const result = await getAllMessageTemplates();
      if (result.error) throw new Error(result.error);
      return result.data;
    },
  });
}

/**
 * Fetch a single message template by ID
 */
export function useMessageTemplate(id: string | undefined) {
  return useQuery({
    queryKey: ['messageTemplate', id],
    queryFn: async () => {
      if (!id) throw new Error('Template ID is required');
      const result = await getMessageTemplate(id);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    enabled: !!id,
  });
}

/**
 * Create a new message template
 */
export function useCreateMessageTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      name: string;
      title_template: string;
      content_template: string;
      category_id?: string;
      variables?: Array<{ name: string; description?: string; required?: boolean }>;
    }) => {
      const result = await createMessageTemplate(data);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messageTemplates'] });
    },
  });
}

/**
 * Update a message template
 */
export function useUpdateMessageTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{
        name: string;
        title_template: string;
        content_template: string;
        category_id: string | null;
        variables: Array<{ name: string; description?: string; required?: boolean }>;
        is_active: boolean;
      }>;
    }) => {
      const result = await updateMessageTemplate(id, data);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['messageTemplates'] });
      queryClient.invalidateQueries({ queryKey: ['messageTemplate', variables.id] });
    },
  });
}

/**
 * Delete a message template (soft delete)
 */
export function useDeleteMessageTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteMessageTemplate(id);
      if (result.error) throw new Error(result.error);
      return result.success;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messageTemplates'] });
    },
  });
}

// =====================================================
// Emergency Broadcast
// =====================================================

/**
 * Send an emergency broadcast to all residents
 * Creates an announcement and sends notifications immediately
 */
export function useSendEmergencyBroadcast() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: EmergencyBroadcastInput) => {
      const result = await sendEmergencyBroadcast(data);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      queryClient.invalidateQueries({ queryKey: ['publishedAnnouncements'] });
      queryClient.invalidateQueries({ queryKey: ['inAppNotifications'] });
    },
  });
}
