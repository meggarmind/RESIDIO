'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getResidents } from '@/actions/residents/get-residents';
import { getResident } from '@/actions/residents/get-resident';
import { getResidentStats } from '@/actions/residents/get-resident-stats';
import { createResident } from '@/actions/residents/create-resident';
import { updateResident } from '@/actions/residents/update-resident';
import { deleteResident } from '@/actions/residents/delete-resident';
import { assignHouse } from '@/actions/residents/assign-house';
import { unassignHouse } from '@/actions/residents/unassign-house';
import { moveOutLandlord } from '@/actions/residents/move-out-landlord';
import { updateResidentHouse } from '@/actions/residents/update-resident-house';
import { swapResidentRoles } from '@/actions/residents/swap-resident-roles';
import { transferOwnership } from '@/actions/residents/transfer-ownership';
import { removeOwnership } from '@/actions/residents/remove-ownership';
import { verifyResident, rejectResidentVerification } from '@/actions/residents/verify-resident';
import type { ResidentSearchParams, CreateResidentData, ResidentFormData, HouseAssignmentData } from '@/lib/validators/resident';
import type { ResidentRole } from '@/types/database';

// Type for resident house update data (defined inline since it's from 'use server' file)
type UpdateResidentHouseData = {
  resident_role?: ResidentRole;
  sponsor_resident_id?: string | null;
  is_billing_responsible?: boolean;
};

export function useResidents(params: Partial<ResidentSearchParams> = {}) {
  return useQuery({
    queryKey: ['residents', params],
    queryFn: async () => {
      const result = await getResidents(params);
      if (result.error) throw new Error(result.error);
      return { data: result.data, count: result.count };
    },
  });
}

/**
 * Optimized hook for fetching resident stats (total, active, inactive, suspended).
 * Uses COUNT queries instead of fetching all residents.
 * ~1000x faster than using useResidents({ limit: 10000 }) for stats.
 */
export function useResidentStats() {
  return useQuery({
    queryKey: ['residentStats'],
    queryFn: async () => {
      const result = await getResidentStats();
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    staleTime: 60000, // Cache for 1 minute (stats don't change frequently)
  });
}

export function useResident(id: string | undefined) {
  return useQuery({
    queryKey: ['resident', id],
    queryFn: async () => {
      if (!id) throw new Error('Resident ID is required');
      const result = await getResident(id);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    enabled: !!id,
  });
}

export function useCreateResident() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateResidentData) => {
      const result = await createResident(data);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['residents'] });
      queryClient.invalidateQueries({ queryKey: ['residentStats'] });
      queryClient.invalidateQueries({ queryKey: ['houses'] });
    },
  });
}

export function useUpdateResident() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ResidentFormData }) => {
      const result = await updateResident(id, data);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['residents'] });
      queryClient.invalidateQueries({ queryKey: ['residentStats'] });
      queryClient.invalidateQueries({ queryKey: ['resident', variables.id] });
    },
  });
}

export function useDeleteResident() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteResident(id);
      if (result.error) throw new Error(result.error);
      return result.success;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['residents'] });
      queryClient.invalidateQueries({ queryKey: ['residentStats'] });
      queryClient.invalidateQueries({ queryKey: ['houses'] });
    },
  });
}

export function useAssignHouse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ residentId, data }: { residentId: string; data: HouseAssignmentData }) => {
      const result = await assignHouse(residentId, data);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['residents'] });
      queryClient.invalidateQueries({ queryKey: ['resident', variables.residentId] });
      queryClient.invalidateQueries({ queryKey: ['houses'] });
    },
    onError: (error) => {
      console.error('[Assign House] Error:', error.message);
    },
  });
}

export function useUnassignHouse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      residentId,
      houseId,
      moveOutDate,
      notes
    }: {
      residentId: string;
      houseId: string;
      moveOutDate?: string;
      notes?: string;
    }) => {
      const result = await unassignHouse(residentId, houseId, moveOutDate, notes);
      if (result.error) throw new Error(result.error);
      return { success: result.success, cascadeRemovedCount: result.cascadeRemovedCount };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['residents'] });
      queryClient.invalidateQueries({ queryKey: ['resident', variables.residentId] });
      queryClient.invalidateQueries({ queryKey: ['houses'] });
      queryClient.invalidateQueries({ queryKey: ['house', variables.houseId] });
      queryClient.invalidateQueries({ queryKey: ['ownershipHistory', variables.houseId] });
    },
  });
}

export function useMoveOutLandlord() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      residentId,
      houseId,
      moveOutDate,
      notes
    }: {
      residentId: string;
      houseId: string;
      moveOutDate?: string;
      notes?: string;
    }) => {
      const result = await moveOutLandlord(residentId, houseId, moveOutDate, notes);
      if (result.error) throw new Error(result.error);
      return { success: result.success, movedOutResidents: result.movedOutResidents };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['residents'] });
      queryClient.invalidateQueries({ queryKey: ['resident', variables.residentId] });
      queryClient.invalidateQueries({ queryKey: ['houses'] });
      queryClient.invalidateQueries({ queryKey: ['house', variables.houseId] });
      queryClient.invalidateQueries({ queryKey: ['ownershipHistory', variables.houseId] });
    },
  });
}

export function useUpdateResidentHouse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      residentId,
      houseId,
      data
    }: {
      residentId: string;
      houseId: string;
      data: UpdateResidentHouseData;
    }) => {
      const result = await updateResidentHouse(residentId, houseId, data);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['residents'] });
      queryClient.invalidateQueries({ queryKey: ['resident', variables.residentId] });
      queryClient.invalidateQueries({ queryKey: ['houses'] });
      queryClient.invalidateQueries({ queryKey: ['house', variables.houseId] });
      queryClient.invalidateQueries({ queryKey: ['ownershipHistory', variables.houseId] });
    },
  });
}

export function useSwapResidentRoles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      houseId,
      promoteResidentId,
      demoteResidentId
    }: {
      houseId: string;
      promoteResidentId: string;
      demoteResidentId: string;
    }) => {
      const result = await swapResidentRoles(houseId, promoteResidentId, demoteResidentId);
      if (result.error) throw new Error(result.error);
      return result.success;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['residents'] });
      queryClient.invalidateQueries({ queryKey: ['resident', variables.promoteResidentId] });
      queryClient.invalidateQueries({ queryKey: ['resident', variables.demoteResidentId] });
      queryClient.invalidateQueries({ queryKey: ['houses'] });
      queryClient.invalidateQueries({ queryKey: ['house', variables.houseId] });
      queryClient.invalidateQueries({ queryKey: ['ownershipHistory', variables.houseId] });
    },
  });
}

export function useVerifyResident() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await verifyResident(id);
      if (result.error) throw new Error(result.error);
      return result.success;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['residents'] });
      queryClient.invalidateQueries({ queryKey: ['resident', id] });
    },
  });
}

export function useRejectResidentVerification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const result = await rejectResidentVerification(id, reason);
      if (result.error) throw new Error(result.error);
      return result.success;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['residents'] });
      queryClient.invalidateQueries({ queryKey: ['resident', id] });
    },
  });
}

export function useTransferOwnership() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      houseId,
      currentOwnerId,
      newOwnerId,
      newOwnerRole,
      transferDate,
      transferNotes
    }: {
      houseId: string;
      currentOwnerId: string;
      newOwnerId: string;
      newOwnerRole: 'non_resident_landlord' | 'developer';
      transferDate?: string;
      transferNotes?: string;
    }) => {
      const result = await transferOwnership(
        houseId,
        currentOwnerId,
        newOwnerId,
        newOwnerRole,
        transferDate,
        transferNotes
      );
      if (result.error) throw new Error(result.error);
      return result.success;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['residents'] });
      queryClient.invalidateQueries({ queryKey: ['resident', variables.currentOwnerId] });
      queryClient.invalidateQueries({ queryKey: ['resident', variables.newOwnerId] });
      queryClient.invalidateQueries({ queryKey: ['houses'] });
      queryClient.invalidateQueries({ queryKey: ['house', variables.houseId] });
      queryClient.invalidateQueries({ queryKey: ['ownershipHistory', variables.houseId] });
    },
  });
}

export function useRemoveOwnership() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      houseId,
      ownerId,
      removalDate,
      notes
    }: {
      houseId: string;
      ownerId: string;
      removalDate?: string;
      notes?: string;
    }) => {
      const result = await removeOwnership(houseId, ownerId, removalDate, notes);
      if (result.error) throw new Error(result.error);
      return result.success;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['residents'] });
      queryClient.invalidateQueries({ queryKey: ['resident', variables.ownerId] });
      queryClient.invalidateQueries({ queryKey: ['houses'] });
      queryClient.invalidateQueries({ queryKey: ['house', variables.houseId] });
      queryClient.invalidateQueries({ queryKey: ['ownershipHistory', variables.houseId] });
    },
  });
}
