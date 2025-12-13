'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getResidents } from '@/actions/residents/get-residents';
import { getResident } from '@/actions/residents/get-resident';
import { createResident } from '@/actions/residents/create-resident';
import { updateResident } from '@/actions/residents/update-resident';
import { deleteResident } from '@/actions/residents/delete-resident';
import { assignHouse } from '@/actions/residents/assign-house';
import { unassignHouse } from '@/actions/residents/unassign-house';
import { moveOutLandlord } from '@/actions/residents/move-out-landlord';
import { updateResidentHouse, type UpdateResidentHouseData } from '@/actions/residents/update-resident-house';
import { swapResidentRoles } from '@/actions/residents/swap-resident-roles';
import { transferOwnership } from '@/actions/residents/transfer-ownership';
import { removeOwnership } from '@/actions/residents/remove-ownership';
import { verifyResident } from '@/actions/residents/verify-resident';
import type { ResidentSearchParams, CreateResidentData, ResidentFormData, HouseAssignmentData } from '@/lib/validators/resident';

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
