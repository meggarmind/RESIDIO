'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getNotifications,
  getUnreadNotificationCount,
  getNotification,
  type NotificationListParams,
} from '@/actions/in-app-notifications/get-notifications';
import {
  createNotification,
  createBulkNotifications,
  createNotificationsForHouses,
  createNotificationsForAllResidents,
  type NotificationCreateInput,
} from '@/actions/in-app-notifications/create-notification';
import {
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  deleteReadNotifications,
  adminDeleteNotification,
} from '@/actions/in-app-notifications/update-notification';

// =====================================================
// Notification Queries
// =====================================================

/**
 * Fetch notifications for the current user
 */
export function useInAppNotifications(params: NotificationListParams = {}) {
  return useQuery({
    queryKey: ['inAppNotifications', params],
    queryFn: async () => {
      const result = await getNotifications(params);
      if (result.error) throw new Error(result.error);
      return { data: result.data, count: result.count };
    },
  });
}

/**
 * Get unread notification count for the current user
 */
export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: ['unreadNotificationCount'],
    queryFn: async () => {
      const result = await getUnreadNotificationCount();
      if (result.error) throw new Error(result.error);
      return result.count;
    },
    // Refetch every 30 seconds to keep badge up to date
    refetchInterval: 30000,
  });
}

/**
 * Get a single notification by ID
 */
export function useInAppNotification(id: string | undefined) {
  return useQuery({
    queryKey: ['inAppNotification', id],
    queryFn: async () => {
      if (!id) throw new Error('Notification ID is required');
      const result = await getNotification(id);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    enabled: !!id,
  });
}

// =====================================================
// Notification Mutations
// =====================================================

/**
 * Create a notification for a specific recipient
 */
export function useCreateNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: NotificationCreateInput) => {
      const result = await createNotification(input);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inAppNotifications'] });
      queryClient.invalidateQueries({ queryKey: ['unreadNotificationCount'] });
    },
  });
}

/**
 * Create notifications for multiple recipients
 */
export function useCreateBulkNotifications() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notifications: NotificationCreateInput[]) => {
      const result = await createBulkNotifications(notifications);
      if (result.error) throw new Error(result.error);
      return result.count;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inAppNotifications'] });
      queryClient.invalidateQueries({ queryKey: ['unreadNotificationCount'] });
    },
  });
}

/**
 * Create notifications for all residents in specific houses
 */
export function useCreateNotificationsForHouses() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      houseIds,
      notification,
    }: {
      houseIds: string[];
      notification: Omit<NotificationCreateInput, 'recipient_id'>;
    }) => {
      const result = await createNotificationsForHouses(houseIds, notification);
      if (result.error) throw new Error(result.error);
      return result.count;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inAppNotifications'] });
      queryClient.invalidateQueries({ queryKey: ['unreadNotificationCount'] });
    },
  });
}

/**
 * Create notifications for all active residents
 */
export function useCreateNotificationsForAllResidents() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notification: Omit<NotificationCreateInput, 'recipient_id'>) => {
      const result = await createNotificationsForAllResidents(notification);
      if (result.error) throw new Error(result.error);
      return result.count;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inAppNotifications'] });
      queryClient.invalidateQueries({ queryKey: ['unreadNotificationCount'] });
    },
  });
}

/**
 * Mark a notification as read
 */
export function useMarkNotificationAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await markNotificationAsRead(id);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inAppNotifications'] });
      queryClient.invalidateQueries({ queryKey: ['unreadNotificationCount'] });
    },
  });
}

/**
 * Mark all notifications as read
 */
export function useMarkAllNotificationsAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const result = await markAllNotificationsAsRead();
      if (result.error) throw new Error(result.error);
      return result.count;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inAppNotifications'] });
      queryClient.invalidateQueries({ queryKey: ['unreadNotificationCount'] });
    },
  });
}

/**
 * Delete a notification (user's own)
 */
export function useDeleteNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteNotification(id);
      if (result.error) throw new Error(result.error);
      return result.success;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inAppNotifications'] });
      queryClient.invalidateQueries({ queryKey: ['unreadNotificationCount'] });
    },
  });
}

/**
 * Delete all read notifications
 */
export function useDeleteReadNotifications() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const result = await deleteReadNotifications();
      if (result.error) throw new Error(result.error);
      return result.count;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inAppNotifications'] });
    },
  });
}

/**
 * Admin: Delete any notification
 */
export function useAdminDeleteNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await adminDeleteNotification(id);
      if (result.error) throw new Error(result.error);
      return result.success;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inAppNotifications'] });
      queryClient.invalidateQueries({ queryKey: ['unreadNotificationCount'] });
    },
  });
}
