'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getTwoFactorStatus,
  initiateTwoFactorSetup,
  confirmTwoFactorSetup,
  disableTwoFactor,
  regenerateBackupCodes,
  getBackupCodesCount,
  requestDisableCode,
  getAllTwoFactorPolicies,
  updateTwoFactorPolicy,
  getTwoFactorAuditLog,
  getRecentTwoFactorActivity,
} from '@/actions/two-factor';
import type {
  TwoFactorStatus,
  TwoFactorMethod,
  Enable2FAInput,
  TwoFactorPolicyWithRole,
  UpdateTwoFactorPolicyInput,
  TwoFactorAuditLogWithProfile,
} from '@/types/database';

// Query keys
const QUERY_KEYS = {
  status: ['two-factor', 'status'],
  policies: ['two-factor', 'policies'],
  auditLog: ['two-factor', 'audit-log'],
  backupCodes: ['two-factor', 'backup-codes'],
  recentActivity: ['two-factor', 'recent-activity'],
};

/**
 * Hook to get 2FA status for current user
 */
export function useTwoFactorStatus() {
  return useQuery({
    queryKey: QUERY_KEYS.status,
    queryFn: async () => {
      const result = await getTwoFactorStatus();
      if (result.error) throw new Error(result.error);
      return result.data;
    },
  });
}

/**
 * Hook to get all 2FA policies
 */
export function useTwoFactorPolicies() {
  return useQuery({
    queryKey: QUERY_KEYS.policies,
    queryFn: async () => {
      const result = await getAllTwoFactorPolicies();
      if (result.error) throw new Error(result.error);
      return result.data;
    },
  });
}

/**
 * Hook to get backup codes count
 */
export function useBackupCodesCount() {
  return useQuery({
    queryKey: QUERY_KEYS.backupCodes,
    queryFn: async () => {
      const result = await getBackupCodesCount();
      return result;
    },
  });
}

/**
 * Hook to get recent 2FA activity
 */
export function useRecentTwoFactorActivity() {
  return useQuery({
    queryKey: QUERY_KEYS.recentActivity,
    queryFn: async () => {
      const result = await getRecentTwoFactorActivity();
      if (result.error) throw new Error(result.error);
      return result.data;
    },
  });
}

/**
 * Hook to get 2FA audit log
 */
export function useTwoFactorAuditLog(params?: {
  profileId?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: [...QUERY_KEYS.auditLog, params],
    queryFn: async () => {
      const result = await getTwoFactorAuditLog(params);
      if (result.error) throw new Error(result.error);
      return { data: result.data, total: result.total };
    },
  });
}

/**
 * Hook to initiate 2FA setup
 */
export function useInitiate2FASetup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Enable2FAInput) => {
      const result = await initiateTwoFactorSetup(input);
      if (!result.success) throw new Error(result.message);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.status });
    },
  });
}

/**
 * Hook to confirm 2FA setup
 */
export function useConfirm2FASetup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ code, method }: { code: string; method: TwoFactorMethod }) => {
      const result = await confirmTwoFactorSetup(code, method);
      if (!result.success) throw new Error(result.message);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.status });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.backupCodes });
    },
  });
}

/**
 * Hook to disable 2FA
 */
export function useDisable2FA() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (verificationCode: string) => {
      const result = await disableTwoFactor(verificationCode);
      if (!result.success) throw new Error(result.message);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.status });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.backupCodes });
    },
  });
}

/**
 * Hook to request disable code
 */
export function useRequestDisableCode() {
  return useMutation({
    mutationFn: async () => {
      const result = await requestDisableCode();
      if (!result.success) throw new Error(result.message);
      return result;
    },
  });
}

/**
 * Hook to regenerate backup codes
 */
export function useRegenerateBackupCodes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const result = await regenerateBackupCodes();
      if (!result.success) throw new Error(result.message);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.backupCodes });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.status });
    },
  });
}

/**
 * Hook to update 2FA policy
 */
export function useUpdateTwoFactorPolicy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      policyId,
      input,
    }: {
      policyId: string | null;
      input: UpdateTwoFactorPolicyInput;
    }) => {
      const result = await updateTwoFactorPolicy(policyId, input);
      if (!result.success) throw new Error(result.message);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.policies });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.status });
    },
  });
}
