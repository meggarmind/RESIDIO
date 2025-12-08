'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getResidents } from '@/actions/residents/get-residents';
import { getResident } from '@/actions/residents/get-resident';
import { createResident } from '@/actions/residents/create-resident';
import { updateResident } from '@/actions/residents/update-resident';
import { deleteResident } from '@/actions/residents/delete-resident';
import { assignHouse } from '@/actions/residents/assign-house';
import { unassignHouse } from '@/actions/residents/unassign-house';
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
  });
}

export function useUnassignHouse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ residentId, houseId }: { residentId: string; houseId: string }) => {
      const result = await unassignHouse(residentId, houseId);
      if (result.error) throw new Error(result.error);
      return result.success;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['residents'] });
      queryClient.invalidateQueries({ queryKey: ['resident', variables.residentId] });
      queryClient.invalidateQueries({ queryKey: ['houses'] });
      queryClient.invalidateQueries({ queryKey: ['house', variables.houseId] });
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
