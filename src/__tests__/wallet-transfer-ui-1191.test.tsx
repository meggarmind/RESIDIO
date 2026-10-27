// @vitest-environment jsdom
//
// #1191: the "Transfer credit" button on the resident wallet panel is gated on the write permission
// billing.transfer_wallet_credit, and the dialog sends the chosen wallets, house, amount and reason.

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { WalletBalance } from '@/components/residents/wallet-balance';
import { WalletTransferDialog } from '@/components/residents/wallet-transfer-dialog';
import {
  useResidentWallets,
  useYearlyWalletTransactions,
  useCreditWallet,
  useDebitWallet,
  useTransferWalletCredit,
  useWalletTransferTargets,
} from '@/hooks/use-wallet';
import { useAuth } from '@/lib/auth/auth-provider';

vi.mock('@/hooks/use-wallet', () => ({
  useResidentWallets: vi.fn(),
  useYearlyWalletTransactions: vi.fn(),
  useCreditWallet: vi.fn(),
  useDebitWallet: vi.fn(),
  useTransferWalletCredit: vi.fn(),
  useWalletTransferTargets: vi.fn(),
}));

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: vi.fn(),
}));

const RESIDENT = 'resident-a';
const TENANT = 'resident-t';
const WALLETS = [
  { charge_category: 'dues', name: 'Dues', wallet_id: 'w-dues', balance: 0 },
  { charge_category: 'development_levy', name: 'Development Levy', wallet_id: 'w-levy', balance: 5000 },
];

beforeAll(() => {
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function mockHooks(mutateAsync = vi.fn().mockResolvedValue({ success: true })) {
  const idle = { mutateAsync: vi.fn(), isPending: false };
  vi.mocked(useCreditWallet).mockReturnValue(idle as unknown as ReturnType<typeof useCreditWallet>);
  vi.mocked(useDebitWallet).mockReturnValue(idle as unknown as ReturnType<typeof useDebitWallet>);
  vi.mocked(useTransferWalletCredit).mockReturnValue({ mutateAsync, isPending: false } as unknown as ReturnType<typeof useTransferWalletCredit>);
  vi.mocked(useWalletTransferTargets).mockReturnValue({
    data: [{ houseId: 'house-1', houseLabel: '12 Palm Close', residents: [{ id: RESIDENT, name: 'Mr A' }, { id: TENANT, name: 'Ms T' }] }],
    isLoading: false,
  } as unknown as ReturnType<typeof useWalletTransferTargets>);
  vi.mocked(useResidentWallets).mockReturnValue({
    data: { total: 5000, wallets: WALLETS },
    isLoading: false,
  } as unknown as ReturnType<typeof useResidentWallets>);
  vi.mocked(useYearlyWalletTransactions).mockReturnValue({ data: [], isLoading: false } as unknown as ReturnType<
    typeof useYearlyWalletTransactions
  >);
  return mutateAsync;
}

function mockPermissions(granted: string[]) {
  vi.mocked(useAuth).mockReturnValue({
    hasPermission: (permission: string) => granted.includes(permission),
    isLoading: false,
  } as unknown as ReturnType<typeof useAuth>);
}

function choose(label: string, option: string) {
  fireEvent.click(screen.getByRole('combobox', { name: label }));
  fireEvent.click(screen.getByRole('option', { name: option }));
}

describe('Transfer credit button (#1191)', () => {
  it('is shown to a holder of billing.transfer_wallet_credit', () => {
    mockHooks();
    mockPermissions(['billing.transfer_wallet_credit']);
    render(<WalletBalance residentId={RESIDENT} />);
    expect(screen.getByRole('button', { name: /transfer credit/i })).toBeInTheDocument();
  });

  it('is hidden without it, even for a holder of billing.manage_wallets', () => {
    mockHooks();
    mockPermissions(['billing.manage_wallets']);
    render(<WalletBalance residentId={RESIDENT} />);
    expect(screen.queryByRole('button', { name: /transfer credit/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /adjust/i })).toBeInTheDocument();
  });
});

describe('WalletTransferDialog (#1191)', () => {
  it('sends the source wallet, receiving resident and wallet, the only house, amount and reason', async () => {
    const mutateAsync = mockHooks();
    const onOpenChange = vi.fn();
    render(<WalletTransferDialog residentId={RESIDENT} wallets={WALLETS} open onOpenChange={onOpenChange} />);
    const dialog = screen.getByRole('dialog');
    const submit = within(dialog).getByRole('button', { name: 'Transfer credit' });

    choose('From wallet', 'Development Levy (₦5,000.00)');
    choose('To resident', 'Ms T');
    choose('To wallet', 'Dues');
    fireEvent.change(within(dialog).getByLabelText('Amount'), { target: { value: '2000' } });
    expect(submit).toBeDisabled(); // no reason yet
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'Landlord pays tenant dues' } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({
      fromWalletId: 'w-levy',
      toResidentId: TENANT,
      toChargeCategory: 'dues',
      amount: 2000,
      reason: 'Landlord pays tenant dues',
      houseId: 'house-1',
    });
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('blocks an amount above the source balance and the same wallet', () => {
    mockHooks();
    render(<WalletTransferDialog residentId={RESIDENT} wallets={WALLETS} open onOpenChange={vi.fn()} />);
    const dialog = screen.getByRole('dialog');

    choose('From wallet', 'Development Levy (₦5,000.00)');
    choose('To wallet', 'Development Levy');
    expect(within(dialog).getByText('Choose a different wallet to receive the credit.')).toBeInTheDocument();
    choose('To wallet', 'Dues');
    fireEvent.change(within(dialog).getByLabelText('Amount'), { target: { value: '6000' } });
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'Too much' } });
    expect(within(dialog).getByText(/Cannot transfer more than the wallet holds/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Transfer credit' })).toBeDisabled();
  });
});
