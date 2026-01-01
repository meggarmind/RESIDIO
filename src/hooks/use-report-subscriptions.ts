'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getMyReportSubscription,
  getReportSubscription,
} from '@/actions/report-subscriptions/get-subscription';
import {
  updateMyReportSubscription,
  createDefaultReportSubscription,
  adminUpdateReportSubscription,
  type ReportSubscriptionUpdateInput,
} from '@/actions/report-subscriptions/update-subscription';

// =====================================================
// Report Subscription Queries
// =====================================================

/**
 * Get report subscription for the current user
 */
export function useMyReportSubscription() {
  return useQuery({
    queryKey: ['myReportSubscription'],
    queryFn: async () => {
      const result = await getMyReportSubscription();
      if (result.error) throw new Error(result.error);
      return result.data;
    },
  });
}

/**
 * Get report subscription for a specific resident (admin)
 */
export function useReportSubscription(residentId: string | undefined) {
  return useQuery({
    queryKey: ['reportSubscription', residentId],
    queryFn: async () => {
      if (!residentId) throw new Error('Resident ID is required');
      const result = await getReportSubscription(residentId);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    enabled: !!residentId,
  });
}

// =====================================================
// Report Subscription Mutations
// =====================================================

/**
 * Update report subscription for the current user
 */
export function useUpdateMyReportSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ReportSubscriptionUpdateInput) => {
      const result = await updateMyReportSubscription(input);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myReportSubscription'] });
    },
  });
}

/**
 * Create default report subscription for a resident
 */
export function useCreateDefaultReportSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (residentId: string) => {
      const result = await createDefaultReportSubscription(residentId);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (_, residentId) => {
      queryClient.invalidateQueries({ queryKey: ['reportSubscription', residentId] });
      queryClient.invalidateQueries({ queryKey: ['myReportSubscription'] });
    },
  });
}

/**
 * Admin: Update report subscription for any resident
 */
export function useAdminUpdateReportSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      residentId,
      input,
    }: {
      residentId: string;
      input: ReportSubscriptionUpdateInput;
    }) => {
      const result = await adminUpdateReportSubscription(residentId, input);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['reportSubscription', variables.residentId] });
    },
  });
}
