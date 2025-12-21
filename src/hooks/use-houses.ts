'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getHouses, getHousesWithRoles } from '@/actions/houses/get-houses';
import { getHouse } from '@/actions/houses/get-house';
import { createHouse } from '@/actions/houses/create-house';
import { updateHouse } from '@/actions/houses/update-house';
import { deleteHouse } from '@/actions/houses/delete-house';
import { getOwnershipHistory } from '@/actions/houses/get-ownership-history';
import type { HouseSearchParams, HouseFormData } from '@/lib/validators/house';
import type { HouseOwnershipHistoryWithResident } from '@/types/database';

// Extended type with computed end_date for ownership periods
export type OwnershipHistoryWithEndDate = HouseOwnershipHistoryWithResident & {
  end_date: string | null;
};
import { toast } from 'sonner';

export function useHouses(params: Partial<HouseSearchParams> = {}) {
  return useQuery({
    queryKey: ['houses', params],
    queryFn: async () => {
      const result = await getHouses(params);
      if (result.error) throw new Error(result.error);
      return { data: result.data, count: result.count };
    },
  });
}

/**
 * Fetch houses with their active roles for filtering in resident forms.
 * Use this when you need to filter houses based on whether they have an owner/tenant.
 */
export function useHousesWithRoles(params: Partial<HouseSearchParams> = {}) {
  return useQuery({
    queryKey: ['houses-with-roles', params],
    queryFn: async () => {
      const result = await getHousesWithRoles(params);
      if (result.error) throw new Error(result.error);
      return { data: result.data, count: result.count };
    },
  });
}

export function useHouse(id: string | undefined) {
  return useQuery({
    queryKey: ['house', id],
    queryFn: async () => {
      if (!id) throw new Error('House ID is required');
      const result = await getHouse(id);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    enabled: !!id,
  });
}

export function useCreateHouse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: HouseFormData) => {
      const result = await createHouse(data);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['houses'] });
    },
  });
}

export function useUpdateHouse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: HouseFormData }) => {
      const result = await updateHouse(id, data);
      if (result.error) throw new Error(result.error);
      return { data: result.data, approval_required: result.approval_required };
    },
    onSuccess: (result, variables) => {
      if (result.approval_required) {
        toast.info('Plot change submitted for approval');
      } else {
        toast.success('House updated successfully');
      }
      queryClient.invalidateQueries({ queryKey: ['houses'] });
      queryClient.invalidateQueries({ queryKey: ['house', variables.id] });
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update house');
    },
  });
}

export function useDeleteHouse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteHouse(id);
      if (result.error) throw new Error(result.error);
      return result.success;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['houses'] });
    },
  });
}

/**
 * Fetch ownership and occupancy history for a house.
 * Returns all history events in chronological order (newest first).
 */
export function useOwnershipHistory(houseId: string | undefined) {
  return useQuery({
    queryKey: ['ownershipHistory', houseId],
    queryFn: async () => {
      if (!houseId) throw new Error('House ID is required');
      const result = await getOwnershipHistory(houseId);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    enabled: !!houseId,
  });
}
