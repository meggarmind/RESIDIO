'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getStreets } from '@/actions/reference/get-streets';
import { getHouseTypes } from '@/actions/reference/get-house-types';
import { updateStreet } from '@/actions/reference/update-street';
import { duplicateStreet } from '@/actions/reference/duplicate-street';
import { toast } from 'sonner';
import type { StreetFormData } from '@/lib/validators/house';

export function useStreets() {
  return useQuery({
    queryKey: ['streets'],
    queryFn: async () => {
      const result = await getStreets();
      if (result.error) throw new Error(result.error);
      return result.data;
    },
  });
}

export function useUpdateStreet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: StreetFormData }) => {
      const result = await updateStreet(id, data);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      toast.success('Street updated successfully');
      queryClient.invalidateQueries({ queryKey: ['streets'] });
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update street');
    },
  });
}

export function useDuplicateStreet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await duplicateStreet(id);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      toast.success('Street duplicated successfully');
      queryClient.invalidateQueries({ queryKey: ['streets'] });
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to duplicate street');
    },
  });
}

export function useHouseTypes() {
  return useQuery({
    queryKey: ['house-types'],
    queryFn: async () => {
      const result = await getHouseTypes();
      if (result.error) throw new Error(result.error);
      return result.data;
    },
  });
}
