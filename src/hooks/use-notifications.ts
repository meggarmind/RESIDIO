'use client';

/**
 * Phase 11: Notification System Hooks
 *
 * React Query hooks for notification templates, schedules, queue, history, and preferences.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  // Templates
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  toggleTemplateActive,
  duplicateTemplate,
  // Schedules
  getSchedules,
  getSchedule,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  toggleScheduleActive,
  // Queue
  getNotificationQueue,
  getQueueItem,
  getQueueStatistics,
  queueNotificationFromTemplate,
  queueDirectNotification,
  cancelNotification,
  retryNotification,
  processNotificationQueue,
  // History
  getNotificationHistory,
  getHistoryEntry,
  getNotificationStats,
  getRecentNotifications,
  // Preferences
  getResidentPreferences,
  getResidentPreferencesByCategory,
  updateResidentPreference,
  initializeResidentPreferences,
  toggleCategoryNotifications,
  toggleChannelNotifications,
  resetResidentPreferences,
  // Send
  sendTemplateNotification,
  sendDirectNotification,
  sendBulkNotification,
} from '@/actions/notifications';
import type {
  NotificationTemplate,
  NotificationSchedule,
  NotificationQueueItem,
  NotificationHistoryEntry,
  NotificationPreference,
  CreateTemplateInput,
  UpdateTemplateInput,
  CreateScheduleInput,
  UpdateScheduleInput,
  UpdatePreferencesInput,
  QueueStatus,
  HistoryStatus,
  NotificationChannel,
  NotificationCategory,
} from '@/lib/notifications/types';

// ============================================================================
// QUERY KEYS
// ============================================================================
export const notificationKeys = {
  all: ['notifications'] as const,
  templates: () => [...notificationKeys.all, 'templates'] as const,
  template: (id: string) => [...notificationKeys.templates(), id] as const,
  schedules: () => [...notificationKeys.all, 'schedules'] as const,
  schedule: (id: string) => [...notificationKeys.schedules(), id] as const,
  queue: () => [...notificationKeys.all, 'queue'] as const,
  queueStats: () => [...notificationKeys.queue(), 'stats'] as const,
  queueItem: (id: string) => [...notificationKeys.queue(), id] as const,
  history: () => [...notificationKeys.all, 'history'] as const,
  historyStats: () => [...notificationKeys.history(), 'stats'] as const,
  historyEntry: (id: string) => [...notificationKeys.history(), id] as const,
  preferences: (residentId: string) =>
    [...notificationKeys.all, 'preferences', residentId] as const,
  preferencesByCategory: (residentId: string) =>
    [...notificationKeys.preferences(residentId), 'byCategory'] as const,
};

// ============================================================================
// TEMPLATE HOOKS
// ============================================================================

export function useNotificationTemplates(options?: {
  category?: string;
  channel?: string;
  activeOnly?: boolean;
}) {
  return useQuery({
    queryKey: [...notificationKeys.templates(), options],
    queryFn: async () => {
      const { data, error } = await getTemplates(options);
      if (error) throw new Error(error);
      return data;
    },
  });
}

export function useNotificationTemplate(id: string) {
  return useQuery({
    queryKey: notificationKeys.template(id),
    queryFn: async () => {
      const { data, error } = await getTemplate(id);
      if (error) throw new Error(error);
      return data;
    },
    enabled: !!id,
  });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateTemplateInput) => {
      const { data, error } = await createTemplate(input);
      if (error) throw new Error(error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.templates() });
      toast.success('Template created successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create template: ${error.message}`);
    },
  });
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateTemplateInput }) => {
      const { data, error } = await updateTemplate(id, input);
      if (error) throw new Error(error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.templates() });
      if (data) {
        queryClient.invalidateQueries({ queryKey: notificationKeys.template(data.id) });
      }
      toast.success('Template updated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update template: ${error.message}`);
    },
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { success, error } = await deleteTemplate(id);
      if (!success) throw new Error(error || 'Failed to delete');
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.templates() });
      toast.success('Template deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete template: ${error.message}`);
    },
  });
}

export function useToggleTemplateActive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await toggleTemplateActive(id);
      if (error) throw new Error(error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.templates() });
      const status = data?.is_active ? 'activated' : 'deactivated';
      toast.success(`Template ${status}`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to toggle template: ${error.message}`);
    },
  });
}

export function useDuplicateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, newName }: { id: string; newName: string }) => {
      const { data, error } = await duplicateTemplate(id, newName);
      if (error) throw new Error(error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.templates() });
      toast.success('Template duplicated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to duplicate template: ${error.message}`);
    },
  });
}

// ============================================================================
// SCHEDULE HOOKS
// ============================================================================

export function useNotificationSchedules(options?: {
  templateId?: string;
  activeOnly?: boolean;
}) {
  return useQuery({
    queryKey: [...notificationKeys.schedules(), options],
    queryFn: async () => {
      const { data, error } = await getSchedules(options);
      if (error) throw new Error(error);
      return data;
    },
  });
}

export function useNotificationSchedule(id: string) {
  return useQuery({
    queryKey: notificationKeys.schedule(id),
    queryFn: async () => {
      const { data, error } = await getSchedule(id);
      if (error) throw new Error(error);
      return data;
    },
    enabled: !!id,
  });
}

export function useCreateSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateScheduleInput) => {
      const { data, error } = await createSchedule(input);
      if (error) throw new Error(error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.schedules() });
      toast.success('Schedule created successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create schedule: ${error.message}`);
    },
  });
}

export function useUpdateSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateScheduleInput }) => {
      const { data, error } = await updateSchedule(id, input);
      if (error) throw new Error(error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.schedules() });
      if (data) {
        queryClient.invalidateQueries({ queryKey: notificationKeys.schedule(data.id) });
      }
      toast.success('Schedule updated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update schedule: ${error.message}`);
    },
  });
}

export function useDeleteSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { success, error } = await deleteSchedule(id);
      if (!success) throw new Error(error || 'Failed to delete');
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.schedules() });
      toast.success('Schedule deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete schedule: ${error.message}`);
    },
  });
}

export function useToggleScheduleActive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await toggleScheduleActive(id);
      if (error) throw new Error(error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.schedules() });
      const status = data?.is_active ? 'activated' : 'deactivated';
      toast.success(`Schedule ${status}`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to toggle schedule: ${error.message}`);
    },
  });
}

// ============================================================================
// QUEUE HOOKS
// ============================================================================

export function useNotificationQueue(options?: {
  status?: QueueStatus;
  channel?: NotificationChannel;
  limit?: number;
}) {
  return useQuery({
    queryKey: [...notificationKeys.queue(), options],
    queryFn: async () => {
      const { data, error } = await getNotificationQueue(options);
      if (error) throw new Error(error);
      return data;
    },
  });
}

export function useQueueStatistics() {
  return useQuery({
    queryKey: notificationKeys.queueStats(),
    queryFn: async () => {
      const { data, error } = await getQueueStatistics();
      if (error) throw new Error(error);
      return data;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

export function useQueueNotificationFromTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      templateId: string;
      recipientId: string;
      variables: Record<string, unknown>;
      priority?: number;
      scheduledFor?: Date;
      entityType?: string;
      entityId?: string;
    }) => {
      const result = await queueNotificationFromTemplate(params);
      if (!result.success) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.queue() });
      toast.success('Notification queued successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to queue notification: ${error.message}`);
    },
  });
}

export function useCancelNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const result = await cancelNotification(id, reason);
      if (!result.success) throw new Error(result.error);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.queue() });
      toast.success('Notification cancelled');
    },
    onError: (error: Error) => {
      toast.error(`Failed to cancel notification: ${error.message}`);
    },
  });
}

export function useRetryNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await retryNotification(id);
      if (!result.success) throw new Error(result.error);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.queue() });
      toast.success('Notification queued for retry');
    },
    onError: (error: Error) => {
      toast.error(`Failed to retry notification: ${error.message}`);
    },
  });
}

export function useProcessQueue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (options?: {
      batchSize?: number;
      channel?: NotificationChannel;
    }) => {
      const { data, error } = await processNotificationQueue(options);
      if (error) throw new Error(error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.queue() });
      queryClient.invalidateQueries({ queryKey: notificationKeys.history() });
      toast.success(
        `Processed ${data?.processed || 0} notifications: ${data?.sent || 0} sent, ${data?.failed || 0} failed`
      );
    },
    onError: (error: Error) => {
      toast.error(`Failed to process queue: ${error.message}`);
    },
  });
}

// ============================================================================
// HISTORY HOOKS
// ============================================================================

export function useNotificationHistory(options?: {
  recipientId?: string;
  templateId?: string;
  channel?: NotificationChannel;
  status?: HistoryStatus;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: [...notificationKeys.history(), options],
    queryFn: async () => {
      const { data, count, error } = await getNotificationHistory(options);
      if (error) throw new Error(error);
      return { data, count };
    },
  });
}

export function useNotificationHistoryEntry(id: string) {
  return useQuery({
    queryKey: notificationKeys.historyEntry(id),
    queryFn: async () => {
      const { data, error } = await getHistoryEntry(id);
      if (error) throw new Error(error);
      return data;
    },
    enabled: !!id,
  });
}

export function useNotificationStats(options?: {
  fromDate?: Date;
  toDate?: Date;
}) {
  return useQuery({
    queryKey: [...notificationKeys.historyStats(), options],
    queryFn: async () => {
      const { data, error } = await getNotificationStats(options);
      if (error) throw new Error(error);
      return data;
    },
  });
}

export function useRecentNotifications(limit: number = 10) {
  return useQuery({
    queryKey: [...notificationKeys.history(), 'recent', limit],
    queryFn: async () => {
      const { data, error } = await getRecentNotifications(limit);
      if (error) throw new Error(error);
      return data;
    },
  });
}

// ============================================================================
// PREFERENCE HOOKS
// ============================================================================

export function useResidentPreferences(residentId: string) {
  return useQuery({
    queryKey: notificationKeys.preferences(residentId),
    queryFn: async () => {
      const { data, error } = await getResidentPreferences(residentId);
      if (error) throw new Error(error);
      return data;
    },
    enabled: !!residentId,
  });
}

export function useResidentPreferencesByCategory(residentId: string) {
  return useQuery({
    queryKey: notificationKeys.preferencesByCategory(residentId),
    queryFn: async () => {
      const { data, error } = await getResidentPreferencesByCategory(residentId);
      if (error) throw new Error(error);
      return data;
    },
    enabled: !!residentId,
  });
}

export function useUpdateResidentPreference() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdatePreferencesInput) => {
      const result = await updateResidentPreference(input);
      if (!result.success) throw new Error(result.error || 'Failed to update');
      return input;
    },
    onSuccess: (input) => {
      queryClient.invalidateQueries({
        queryKey: notificationKeys.preferences(input.resident_id),
      });
      toast.success('Preference updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update preference: ${error.message}`);
    },
  });
}

export function useInitializeResidentPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (residentId: string) => {
      const result = await initializeResidentPreferences(residentId);
      if (!result.success) throw new Error(result.error || 'Failed to initialize');
      return residentId;
    },
    onSuccess: (residentId) => {
      queryClient.invalidateQueries({
        queryKey: notificationKeys.preferences(residentId),
      });
      toast.success('Preferences initialized');
    },
    onError: (error: Error) => {
      toast.error(`Failed to initialize preferences: ${error.message}`);
    },
  });
}

export function useToggleCategoryNotifications() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      residentId: string;
      category: NotificationCategory;
      enabled: boolean;
    }) => {
      const result = await toggleCategoryNotifications(params);
      if (!result.success) throw new Error(result.error || 'Failed to toggle');
      return params;
    },
    onSuccess: (params) => {
      queryClient.invalidateQueries({
        queryKey: notificationKeys.preferences(params.residentId),
      });
      const status = params.enabled ? 'enabled' : 'disabled';
      toast.success(`${params.category} notifications ${status}`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to toggle notifications: ${error.message}`);
    },
  });
}

export function useResetResidentPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (residentId: string) => {
      const result = await resetResidentPreferences(residentId);
      if (!result.success) throw new Error(result.error || 'Failed to reset');
      return residentId;
    },
    onSuccess: (residentId) => {
      queryClient.invalidateQueries({
        queryKey: notificationKeys.preferences(residentId),
      });
      toast.success('Preferences reset to defaults');
    },
    onError: (error: Error) => {
      toast.error(`Failed to reset preferences: ${error.message}`);
    },
  });
}

// ============================================================================
// SEND HOOKS
// ============================================================================

export function useSendTemplateNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      templateId?: string;
      templateName?: string;
      recipientId: string;
      variables: Record<string, unknown>;
    }) => {
      const result = await sendTemplateNotification(params);
      if (!result.success) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.history() });
      toast.success('Notification sent');
    },
    onError: (error: Error) => {
      toast.error(`Failed to send notification: ${error.message}`);
    },
  });
}

export function useSendDirectNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      recipientId: string;
      channel: NotificationChannel;
      subject?: string;
      body: string;
      htmlBody?: string;
      category?: NotificationCategory;
    }) => {
      const result = await sendDirectNotification(params);
      if (!result.success) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.history() });
      toast.success('Notification sent');
    },
    onError: (error: Error) => {
      toast.error(`Failed to send notification: ${error.message}`);
    },
  });
}

export function useSendBulkNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      templateId: string;
      recipientIds: string[];
      variables: Record<string, unknown>;
      immediate?: boolean;
      priority?: number;
    }) => {
      const result = await sendBulkNotification(params);
      if (!result.success) throw new Error(result.errors.join(', '));
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.queue() });
      queryClient.invalidateQueries({ queryKey: notificationKeys.history() });
      toast.success(
        `Bulk notification: ${result.sent} sent, ${result.queued} queued, ${result.failed} failed`
      );
    },
    onError: (error: Error) => {
      toast.error(`Failed to send bulk notification: ${error.message}`);
    },
  });
}
