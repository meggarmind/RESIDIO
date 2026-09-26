import { useQuery, useQueryClient } from '@tanstack/react-query';
import { canViewInactiveBankAccounts } from '@/actions/permissions/can-view-inactive-bank-accounts';

export function useCanViewInactiveBankAccounts() {
  return useQuery({
    queryKey: ['view-inactive-bank-accounts'],
    queryFn: async () => canViewInactiveBankAccounts(),
  });
}
