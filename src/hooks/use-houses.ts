'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getHouses } from '@/actions/houses/get-houses';
import { getHouse } from '@/actions/houses/get-house';
import { createHouse } from '@/actions/houses/create-house';
import { updateHouse } from '@/actions/houses/update-house';
import { deleteHouse } from '@/actions/houses/delete-house';
import type { HouseSearchParams, HouseFormData } from '@/lib/validators/house';

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
      return result.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['houses'] });
      queryClient.invalidateQueries({ queryKey: ['house', variables.id] });
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
