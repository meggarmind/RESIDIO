import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// Bank Accounts
import {
  getBankAccounts,
  getBankAccount,
  createBankAccount,
  updateBankAccount,
  toggleBankAccountStatus,
  deleteBankAccount,
} from '@/actions/imports/bank-accounts';

// Payment Aliases
import {
  getResidentAliases,
  getAllAliases,
  createPaymentAlias,
  updatePaymentAlias,
  toggleAliasStatus,
  deletePaymentAlias,
  getAllActiveAliases,
} from '@/actions/residents/aliases';

// Import Actions
import {
  getImports,
  getImport,
  getImportRows,
  getImportStats,
  getImportRowSummary,
  getImportBreakdown,
  getPendingApprovalImports,
  createImport,
  createImportRows,
  deleteImport,
  matchImportRows,
  manualMatchRow,
  unmatchRow,
  skipRow,
  processImport,
  approveImport,
  rejectImport,
  submitForApproval,
  type ImportSearchParams,
  type ImportRowSearchParams,
  type CreateImportParams,
  type CreateImportRowsParams,
  type ManualMatchParams,
  type ProcessImportOptions,
} from '@/actions/imports';

import type { EstateBankAccountFormData, PaymentAliasFormData, PaymentAliasSearchParams } from '@/lib/validators/import';

// ============================================================
// Bank Account Hooks
// ============================================================

export function useBankAccounts(includeInactive = false) {
  return useQuery({
    queryKey: ['bank-accounts', includeInactive],
    queryFn: () => getBankAccounts(includeInactive),
  });
}

export function useBankAccount(id: string) {
  return useQuery({
    queryKey: ['bank-account', id],
    queryFn: async () => {
      const result = await getBankAccount(id);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    enabled: !!id,
  });
}

export function useCreateBankAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: EstateBankAccountFormData) => {
      const result = await createBankAccount(data);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
      if (result.requiresApproval) {
        toast.info('Bank account creation submitted for approval');
        queryClient.invalidateQueries({ queryKey: ['approval-requests'] });
        queryClient.invalidateQueries({ queryKey: ['pending-approvals-count'] });
      } else {
        toast.success('Bank account created successfully');
      }
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

export function useUpdateBankAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<EstateBankAccountFormData> }) => {
      const result = await updateBankAccount(id, data);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
      if (result.requiresApproval) {
        toast.info('Bank account update submitted for approval');
        queryClient.invalidateQueries({ queryKey: ['approval-requests'] });
        queryClient.invalidateQueries({ queryKey: ['pending-approvals-count'] });
      } else {
        toast.success('Bank account updated successfully');
      }
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

export function useToggleBankAccountStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await toggleBankAccountStatus(id);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
      if (result.requiresApproval) {
        toast.info('Status change submitted for approval');
        queryClient.invalidateQueries({ queryKey: ['approval-requests'] });
        queryClient.invalidateQueries({ queryKey: ['pending-approvals-count'] });
      } else {
        const status = result.data?.is_active ? 'activated' : 'deactivated';
        toast.success(`Bank account ${status} successfully`);
      }
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

export function useDeleteBankAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteBankAccount(id);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
      if (result.requiresApproval) {
        toast.info('Bank account deletion submitted for approval');
        queryClient.invalidateQueries({ queryKey: ['approval-requests'] });
        queryClient.invalidateQueries({ queryKey: ['pending-approvals-count'] });
      } else {
        toast.success('Bank account deleted successfully');
      }
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

// ============================================================
// Payment Alias Hooks
// ============================================================

export function useResidentAliases(residentId: string) {
  return useQuery({
    queryKey: ['payment-aliases', 'resident', residentId],
    queryFn: () => getResidentAliases(residentId),
    enabled: !!residentId,
  });
}

export function useAllAliases(params: Partial<PaymentAliasSearchParams> = {}) {
  return useQuery({
    queryKey: ['payment-aliases', 'all', params],
    queryFn: () => getAllAliases(params),
  });
}

export function useActiveAliases() {
  return useQuery({
    queryKey: ['payment-aliases', 'active'],
    queryFn: () => getAllActiveAliases(),
  });
}

export function useCreatePaymentAlias() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: PaymentAliasFormData) => {
      const result = await createPaymentAlias(data);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['payment-aliases'] });
      queryClient.invalidateQueries({ queryKey: ['payment-aliases', 'resident', variables.resident_id] });
      toast.success('Payment alias created successfully');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

export function useUpdatePaymentAlias() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<PaymentAliasFormData> }) => {
      const result = await updatePaymentAlias(id, data);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-aliases'] });
      toast.success('Payment alias updated successfully');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

export function useToggleAliasStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await toggleAliasStatus(id);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['payment-aliases'] });
      const status = result.data?.is_active ? 'activated' : 'deactivated';
      toast.success(`Payment alias ${status} successfully`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

export function useDeletePaymentAlias() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deletePaymentAlias(id);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-aliases'] });
      toast.success('Payment alias deleted successfully');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

// ============================================================
// Import Hooks
// ============================================================

export function useImports(params: ImportSearchParams = {}) {
  return useQuery({
    queryKey: ['imports', params],
    queryFn: () => getImports(params),
  });
}

export function useImport(id: string) {
  return useQuery({
    queryKey: ['import', id],
    queryFn: async () => {
      const result = await getImport(id);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    enabled: !!id,
  });
}

export function useImportRows(importId: string, params: ImportRowSearchParams = {}) {
  return useQuery({
    queryKey: ['import-rows', importId, params],
    queryFn: async () => {
      const result = await getImportRows(importId, params);
      if (result.error) throw new Error(result.error);
      return result;
    },
    enabled: !!importId,
  });
}

export function useImportStats() {
  return useQuery({
    queryKey: ['import-stats'],
    queryFn: async () => {
      const result = await getImportStats();
      if (result.error) throw new Error(result.error);
      return result.data;
    },
  });
}

export function useImportRowSummary(importId: string) {
  return useQuery({
    queryKey: ['import-row-summary', importId],
    queryFn: async () => {
      const result = await getImportRowSummary(importId);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    enabled: !!importId,
  });
}

/**
 * Hook to get the breakdown of an import by transaction type and tag.
 * Returns totals for credits/debits and per-tag aggregations.
 */
export function useImportBreakdown(importId: string) {
  return useQuery({
    queryKey: ['import-breakdown', importId],
    queryFn: async () => {
      const result = await getImportBreakdown(importId);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    enabled: !!importId,
  });
}

export function usePendingApprovalImports() {
  return useQuery({
    queryKey: ['imports', 'pending-approval'],
    queryFn: () => getPendingApprovalImports(),
  });
}

export function useCreateImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateImportParams) => {
      const result = await createImport(data);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imports'] });
      queryClient.invalidateQueries({ queryKey: ['import-stats'] });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

export function useCreateImportRows() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateImportRowsParams) => {
      const result = await createImportRows(data);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['import', variables.import_id] });
      queryClient.invalidateQueries({ queryKey: ['import-rows', variables.import_id] });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

export function useDeleteImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteImport(id);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imports'] });
      queryClient.invalidateQueries({ queryKey: ['import-stats'] });
      toast.success('Import deleted successfully');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

// ============================================================
// Matching Hooks
// ============================================================

export function useMatchImportRows() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (importId: string) => {
      const result = await matchImportRows(importId);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: (result, importId) => {
      queryClient.invalidateQueries({ queryKey: ['import', importId] });
      queryClient.invalidateQueries({ queryKey: ['import-rows', importId] });
      queryClient.invalidateQueries({ queryKey: ['import-row-summary', importId] });
      toast.success(`Matching complete: ${result.matched_count} matched, ${result.unmatched_count} unmatched`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

export function useManualMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: ManualMatchParams) => {
      const result = await manualMatchRow(data);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['import-rows'] });
      queryClient.invalidateQueries({ queryKey: ['import-row-summary'] });
      toast.success('Row matched successfully');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

export function useUnmatchRow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rowId: string) => {
      const result = await unmatchRow(rowId);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['import-rows'] });
      queryClient.invalidateQueries({ queryKey: ['import-row-summary'] });
      toast.success('Match cleared');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

export function useSkipRow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rowId: string) => {
      const result = await skipRow(rowId);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['import-rows'] });
      queryClient.invalidateQueries({ queryKey: ['import-row-summary'] });
      toast.success('Row marked as skipped');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

// ============================================================
// Process Import Hooks
// ============================================================

export function useProcessImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (options: ProcessImportOptions) => {
      const result = await processImport(options);
      if (!result.success && result.errors.length > 0) {
        throw new Error(result.errors[0]?.error || 'Processing failed');
      }
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['imports'] });
      queryClient.invalidateQueries({ queryKey: ['import', result.import_id] });
      queryClient.invalidateQueries({ queryKey: ['import-rows', result.import_id] });
      queryClient.invalidateQueries({ queryKey: ['import-stats'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['payment-stats'] });
      toast.success(`Import processed: ${result.created_count} payments created`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

export function useApproveImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ importId, notes }: { importId: string; notes?: string }) => {
      const result = await approveImport(importId, notes);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imports'] });
      queryClient.invalidateQueries({ queryKey: ['import-stats'] });
      toast.success('Import approved');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

export function useRejectImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ importId, reason }: { importId: string; reason: string }) => {
      const result = await rejectImport(importId, reason);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imports'] });
      queryClient.invalidateQueries({ queryKey: ['import-stats'] });
      toast.success('Import rejected');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

export function useSubmitForApproval() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (importId: string) => {
      const result = await submitForApproval(importId);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imports'] });
      toast.success('Import submitted for approval');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}
