'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getStreets } from '@/actions/reference/get-streets';
import { getHouseTypes } from '@/actions/reference/get-house-types';
import { createStreet } from '@/actions/reference/create-street';
import { updateStreet } from '@/actions/reference/update-street';
import { duplicateStreet } from '@/actions/reference/duplicate-street';
import { deleteStreet } from '@/actions/reference/delete-street';
import { createHouseType } from '@/actions/reference/create-house-type';
import { updateHouseType } from '@/actions/reference/update-house-type';
import {
  getTransactionTags,
  createTransactionTag,
  updateTransactionTag,
  deleteTransactionTag,
} from '@/actions/reference/transaction-tags';
import { toast } from 'sonner';
import type { StreetFormData, HouseTypeFormData } from '@/lib/validators/house';
import type { TransactionTagInsert, TransactionTagUpdate, TransactionTagType } from '@/types/database';

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

export function useDeleteStreet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteStreet(id);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      toast.success('Street deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['streets'] });
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete street');
    },
  });
}

export function useCreateStreet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: StreetFormData) => {
      const result = await createStreet(data);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      toast.success('Street created successfully');
      queryClient.invalidateQueries({ queryKey: ['streets'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create street');
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

export function useCreateHouseType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: HouseTypeFormData) => {
      const result = await createHouseType(data);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      toast.success('House type created successfully');
      queryClient.invalidateQueries({ queryKey: ['house-types'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create house type');
    },
  });
}

export function useUpdateHouseType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: HouseTypeFormData }) => {
      const result = await updateHouseType(id, data);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      toast.success('House type updated successfully');
      queryClient.invalidateQueries({ queryKey: ['house-types'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update house type');
    },
  });
}

// ============================================================
// Transaction Tags Hooks
// ============================================================

interface UseTransactionTagsOptions {
  transaction_type?: TransactionTagType;
  include_inactive?: boolean;
}

export function useTransactionTags(options: UseTransactionTagsOptions = {}) {
  return useQuery({
    queryKey: ['transaction-tags', options],
    queryFn: async () => {
      const result = await getTransactionTags({
        transaction_type: options.transaction_type,
        include_inactive: options.include_inactive,
      });
      if (result.error) throw new Error(result.error);
      return result.data;
    },
  });
}

export function useCreateTransactionTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: TransactionTagInsert) => {
      const result = await createTransactionTag(data);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      toast.success('Transaction tag created successfully');
      queryClient.invalidateQueries({ queryKey: ['transaction-tags'] });
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create transaction tag');
    },
  });
}

export function useUpdateTransactionTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: TransactionTagUpdate }) => {
      const result = await updateTransactionTag(id, data);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      toast.success('Transaction tag updated successfully');
      queryClient.invalidateQueries({ queryKey: ['transaction-tags'] });
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update transaction tag');
    },
  });
}

export function useDeleteTransactionTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteTransactionTag(id);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      toast.success('Transaction tag deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['transaction-tags'] });
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete transaction tag');
    },
  });
}
