'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  sendEmailVerification,
  sendPhoneVerification,
  verifyContactToken,
  getVerificationStatus,
  adminVerifyContact,
} from '@/actions/verification';
import type { VerificationType } from '@/types/database';

/**
 * Hook to get verification status for a resident
 */
export function useVerificationStatus(residentId: string | undefined) {
  return useQuery({
    queryKey: ['verificationStatus', residentId],
    queryFn: async () => {
      if (!residentId) throw new Error('Resident ID is required');
      const result = await getVerificationStatus(residentId);
      if (!result.success) throw new Error(result.error);
      return result.status;
    },
    enabled: !!residentId,
    staleTime: 30000, // Cache for 30 seconds
  });
}

/**
 * Hook to send email verification code
 */
export function useSendEmailVerification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (residentId: string) => {
      const result = await sendEmailVerification(residentId);
      if (!result.success) throw new Error(result.message);
      return result;
    },
    onSuccess: (_, residentId) => {
      // Invalidate verification status to show pending state
      queryClient.invalidateQueries({ queryKey: ['verificationStatus', residentId] });
    },
  });
}

/**
 * Hook to send phone verification code (SMS)
 */
export function useSendPhoneVerification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (residentId: string) => {
      const result = await sendPhoneVerification(residentId);
      if (!result.success) throw new Error(result.message);
      return result;
    },
    onSuccess: (_, residentId) => {
      queryClient.invalidateQueries({ queryKey: ['verificationStatus', residentId] });
    },
  });
}

/**
 * Hook to verify email with OTP
 */
export function useVerifyEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ residentId, token }: { residentId: string; token: string }) => {
      const result = await verifyContactToken(residentId, token, 'email');
      if (!result.success) throw new Error(result.message);
      return result;
    },
    onSuccess: (_, { residentId }) => {
      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: ['verificationStatus', residentId] });
      queryClient.invalidateQueries({ queryKey: ['resident', residentId] });
      queryClient.invalidateQueries({ queryKey: ['residents'] });
    },
  });
}

/**
 * Hook to verify phone with OTP
 */
export function useVerifyPhone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ residentId, token }: { residentId: string; token: string }) => {
      const result = await verifyContactToken(residentId, token, 'phone');
      if (!result.success) throw new Error(result.message);
      return result;
    },
    onSuccess: (_, { residentId }) => {
      queryClient.invalidateQueries({ queryKey: ['verificationStatus', residentId] });
      queryClient.invalidateQueries({ queryKey: ['resident', residentId] });
      queryClient.invalidateQueries({ queryKey: ['residents'] });
    },
  });
}

/**
 * Hook for admin to manually verify a contact
 */
export function useAdminVerifyContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      residentId,
      contactType,
    }: {
      residentId: string;
      contactType: VerificationType;
    }) => {
      const result = await adminVerifyContact(residentId, contactType);
      if (!result.success) throw new Error(result.message);
      return result;
    },
    onSuccess: (_, { residentId }) => {
      queryClient.invalidateQueries({ queryKey: ['verificationStatus', residentId] });
      queryClient.invalidateQueries({ queryKey: ['resident', residentId] });
      queryClient.invalidateQueries({ queryKey: ['residents'] });
    },
  });
}
