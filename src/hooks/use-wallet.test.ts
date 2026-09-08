import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  creditWallet: vi.fn(),
  debitWallet: vi.fn(),
  invalidateQueries: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  mutationOptions: undefined as Record<string, unknown> | undefined,
}));

vi.mock('@/actions/billing/wallet', () => ({
  creditWallet: mocks.creditWallet,
  debitWallet: mocks.debitWallet,
  getOrCreateWallet: vi.fn(),
  getWalletTransactions: vi.fn(),
  getYearlyWalletTransactions: vi.fn(),
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
  useMutation: (options: Record<string, unknown>) => {
    mocks.mutationOptions = options;
    return options;
  },
}));
vi.mock('sonner', () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));

import { useCreditWallet, useDebitWallet } from '@/hooks/use-wallet';

type MutationOptions = {
  mutationFn: (variables: { residentId: string; amount: number; description: string; reason: string }) => Promise<unknown>;
  onSuccess: (data: unknown, variables: { residentId: string }) => void;
  onError: (error: Error) => void;
};

const variables = { residentId: 'resident-1', amount: 25, description: 'Correction', reason: 'Refund' };

function optionsFor(hook: () => unknown) {
  hook();
  return mocks.mutationOptions as MutationOptions;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mutationOptions = undefined;
});

describe.each([
  ['credit', useCreditWallet, mocks.creditWallet, 'Wallet credited successfully'],
  ['debit', useDebitWallet, mocks.debitWallet, 'Wallet debited successfully'],
] as const)('use%sWallet', (_kind, hook, action, successMessage) => {
  it('throws a failed action result so React Query runs the error path', async () => {
    action.mockResolvedValue({ success: false, error: 'Adjustment failed' });
    const options = optionsFor(hook);

    await expect(options.mutationFn(variables)).rejects.toThrow('Adjustment failed');
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.invalidateQueries).not.toHaveBeenCalled();

    options.onError(new Error('Adjustment failed'));
    expect(mocks.toastError).toHaveBeenCalledWith('Adjustment failed');
  });

  it('keeps successful results on the success path', async () => {
    const result = { success: true, newBalance: 125, error: null };
    action.mockResolvedValue(result);
    const options = optionsFor(hook);

    await expect(options.mutationFn(variables)).resolves.toEqual(result);
    options.onSuccess(result, variables);

    expect(mocks.toastSuccess).toHaveBeenCalledWith(successMessage);
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(mocks.invalidateQueries).toHaveBeenCalledTimes(2);
  });
});
