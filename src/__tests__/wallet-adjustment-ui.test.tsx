// @vitest-environment jsdom
//
// Issue #120: an admin had no UI to credit or debit a resident's wallet.
// `WalletAdjustmentDialog` and `WalletBalance` both existed and were complete,
// but `WalletBalance` was imported by nothing -- the control was orphaned.
//
// These tests pin the three things that must stay true:
//   1. the resident detail page mounts `WalletBalance` (AC-1);
//   2. the "Adjust" control is gated on the WRITE permission
//      `billing.manage_wallets`, not on the route's view permission (AC-2,
//      CORE.md s6) -- a viewer without it still sees the balance;
//   3. submitting the dialog reaches `useCreditWallet` / `useDebitWallet`.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { WalletBalance } from '@/components/residents/wallet-balance';
import { WalletAdjustmentDialog } from '@/components/residents/wallet-adjustment-dialog';
import {
  useWallet,
  useWalletTransactions,
  useCreditWallet,
  useDebitWallet,
} from '@/hooks/use-wallet';
import { useAuth } from '@/lib/auth/auth-provider';

vi.mock('@/hooks/use-wallet', () => ({
  useWallet: vi.fn(),
  useWalletTransactions: vi.fn(),
  useCreditWallet: vi.fn(),
  useDebitWallet: vi.fn(),
}));

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: vi.fn(),
}));

const mockedUseWallet = vi.mocked(useWallet);
const mockedUseWalletTransactions = vi.mocked(useWalletTransactions);
const mockedUseCreditWallet = vi.mocked(useCreditWallet);
const mockedUseDebitWallet = vi.mocked(useDebitWallet);
const mockedUseAuth = vi.mocked(useAuth);

beforeAll(() => {
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  // Radix primitives probe pointer capture, which jsdom does not implement.
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

/** Inert credit/debit mutations, for cases that only assert on rendering. */
function mockIdleMutations() {
  mockedUseCreditWallet.mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useCreditWallet>);
  mockedUseDebitWallet.mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useDebitWallet>);
}

/** Wire the wallet read hooks to a settled wallet with one credit and one debit. */
function mockWalletReads(balance = 50000) {
  mockIdleMutations();
  mockedUseWallet.mockReturnValue({
    data: { data: { id: 'w1', resident_id: 'r1', balance } },
    isLoading: false,
  } as unknown as ReturnType<typeof useWallet>);
  mockedUseWalletTransactions.mockReturnValue({
    data: {
      data: [
        { id: 't1', type: 'credit', amount: 80000 },
        { id: 't2', type: 'debit', amount: 30000 },
      ],
    },
    isLoading: false,
  } as unknown as ReturnType<typeof useWalletTransactions>);
}

/** Mock `useAuth` with a fixed permission set. */
function mockPermissions(granted: string[]) {
  mockedUseAuth.mockReturnValue({
    hasPermission: (permission: string) => granted.includes(permission),
    hasAnyPermission: (permissions: string[]) => permissions.some((p) => granted.includes(p)),
    hasAllPermissions: (permissions: string[]) => permissions.every((p) => granted.includes(p)),
    isLoading: false,
  } as unknown as ReturnType<typeof useAuth>);
}

const MANAGE_WALLETS = 'billing.manage_wallets';
/** The route's VIEW permission -- deliberately NOT what the button is gated on. */
const RESIDENTS_VIEW = 'residents.view';

describe('WalletBalance is mounted on the resident detail page (#120)', () => {
  const pageSource = readFileSync(
    resolve(process.cwd(), 'src/app/(dashboard)/residents/[id]/page.tsx'),
    'utf8'
  );

  it('imports WalletBalance from the residents component directory', () => {
    expect(pageSource).toMatch(
      /import\s*\{\s*WalletBalance\s*\}\s*from\s*'@\/components\/residents\/wallet-balance'/
    );
  });

  it('renders <WalletBalance> with the resident id', () => {
    expect(pageSource).toMatch(/<WalletBalance\s+residentId=\{id\}/);
  });
});

describe('WalletBalance adjustment control permission gate (#120)', () => {
  it('hides the Adjust control from a user lacking billing.manage_wallets', () => {
    mockWalletReads();
    mockPermissions([RESIDENTS_VIEW]);

    render(<WalletBalance residentId="r1" />);

    // The balance itself stays visible -- this is a read-only view, not a denial.
    expect(screen.getByText('Current Balance')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /adjust/i })).not.toBeInTheDocument();
  });

  it('shows the Adjust control to a user holding billing.manage_wallets', () => {
    mockWalletReads();
    mockPermissions([RESIDENTS_VIEW, MANAGE_WALLETS]);

    render(<WalletBalance residentId="r1" />);

    expect(screen.getByText('Current Balance')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /adjust/i })).toBeInTheDocument();
  });

  it('does not grant the control on the route view permission alone', () => {
    mockWalletReads();
    // Every billing permission EXCEPT the write one the control needs.
    mockPermissions([RESIDENTS_VIEW, 'billing.view', 'billing.create', 'billing.update']);

    render(<WalletBalance residentId="r1" />);

    expect(screen.queryByRole('button', { name: /adjust/i })).not.toBeInTheDocument();
  });

  it('still hides the control when showActions is false despite the permission', () => {
    mockWalletReads();
    mockPermissions([MANAGE_WALLETS]);

    render(<WalletBalance residentId="r1" showActions={false} />);

    expect(screen.queryByRole('button', { name: /adjust/i })).not.toBeInTheDocument();
  });

  it('opens the adjustment dialog when the control is clicked', async () => {
    mockWalletReads();
    mockPermissions([MANAGE_WALLETS]);
    mockedUseCreditWallet.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useCreditWallet>);
    mockedUseDebitWallet.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useDebitWallet>);

    render(<WalletBalance residentId="r1" />);
    fireEvent.click(screen.getByRole('button', { name: /adjust/i }));

    await waitFor(() => {
      expect(screen.getByText('Adjust Wallet Balance')).toBeInTheDocument();
    });
  });
});

describe('WalletAdjustmentDialog submit path (#120)', () => {
  function mockMutations() {
    const credit = vi.fn().mockResolvedValue({ success: true });
    const debit = vi.fn().mockResolvedValue({ success: true });
    mockedUseCreditWallet.mockReturnValue({
      mutateAsync: credit,
      isPending: false,
    } as unknown as ReturnType<typeof useCreditWallet>);
    mockedUseDebitWallet.mockReturnValue({
      mutateAsync: debit,
      isPending: false,
    } as unknown as ReturnType<typeof useDebitWallet>);
    return { credit, debit };
  }

  function fillForm({ amount, description }: { amount: string; description: string }) {
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: amount } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: description } });
  }

  it('routes a credit submission to useCreditWallet', async () => {
    const { credit, debit } = mockMutations();
    const onOpenChange = vi.fn();

    render(
      <WalletAdjustmentDialog
        residentId="r1"
        currentBalance={50000}
        open
        onOpenChange={onOpenChange}
      />
    );

    fillForm({ amount: '5000', description: 'Refund for duplicate levy payment' });
    fireEvent.click(screen.getByRole('button', { name: /confirm adjustment/i }));

    await waitFor(() => {
      expect(credit).toHaveBeenCalledWith({
        residentId: 'r1',
        amount: 5000,
        description: 'Refund for duplicate levy payment',
        reason: 'adjustment',
      });
    });
    expect(debit).not.toHaveBeenCalled();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('routes a debit submission to useDebitWallet', async () => {
    const { credit, debit } = mockMutations();

    render(
      <WalletAdjustmentDialog
        residentId="r1"
        currentBalance={50000}
        open
        onOpenChange={vi.fn()}
      />
    );

    fireEvent.click(screen.getByLabelText(/debit \(remove funds\)/i));
    fillForm({ amount: '2500', description: 'Correction of an over-credited receipt' });
    fireEvent.click(screen.getByRole('button', { name: /confirm adjustment/i }));

    await waitFor(() => {
      expect(debit).toHaveBeenCalledWith({
        residentId: 'r1',
        amount: 2500,
        description: 'Correction of an over-credited receipt',
        reason: 'adjustment',
      });
    });
    expect(credit).not.toHaveBeenCalled();
  });

  it('does not call either mutation when the debit exceeds the balance', async () => {
    const { credit, debit } = mockMutations();

    render(
      <WalletAdjustmentDialog
        residentId="r1"
        currentBalance={1000}
        open
        onOpenChange={vi.fn()}
      />
    );

    fireEvent.click(screen.getByLabelText(/debit \(remove funds\)/i));
    fillForm({ amount: '9000', description: 'Attempt to overdraw the wallet balance' });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /confirm adjustment/i })).toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /confirm adjustment/i }));

    await waitFor(() => {
      expect(credit).not.toHaveBeenCalled();
      expect(debit).not.toHaveBeenCalled();
    });
  });

  it('rejects a description shorter than the schema minimum', async () => {
    const { credit, debit } = mockMutations();

    render(
      <WalletAdjustmentDialog
        residentId="r1"
        currentBalance={50000}
        open
        onOpenChange={vi.fn()}
      />
    );

    fillForm({ amount: '1000', description: 'too short' });
    fireEvent.click(screen.getByRole('button', { name: /confirm adjustment/i }));

    await waitFor(() => {
      expect(screen.getByText(/at least 10 characters/i)).toBeInTheDocument();
    });
    expect(credit).not.toHaveBeenCalled();
    expect(debit).not.toHaveBeenCalled();
  });
});
