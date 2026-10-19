// @vitest-environment jsdom
//
// Issue #783: the resident detail page, rendered.
//   1. The visible tab follows `?tab=`, so back/forward switches tab, and picking a
//      tab pushes a history entry.
//   2. The Money tab mounts WalletBalance for the resident.
//   3. Inactivate and Archive live in a "More" menu, each behind its own permission.
//   4. Contact verification is one control confirmed in an AlertDialog.
//   5. A missing resident and a load failure are reported differently.

import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import ResidentDetailPage from '@/app/(dashboard)/residents/[id]/page';
import { useResident } from '@/hooks/use-residents';

const nav = vi.hoisted(() => ({ query: '', push: vi.fn() }));
const auth = vi.hoisted(() => ({ granted: [] as string[] }));
const mutations = vi.hoisted(() => ({
  verifyContact: vi.fn(),
  verifyResident: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn() }),
  usePathname: () => '/residents/r1',
  useSearchParams: () => new URLSearchParams(nav.query),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

vi.mock('next/dynamic', () => ({
  default: <P extends object>(loader: () => Promise<{ default: ComponentType<P> }>) => {
    return function Dynamic(props: P) {
      const [Loaded, setLoaded] = useState<ComponentType<P> | null>(null);
      useEffect(() => {
        void loader().then((m) => setLoaded(() => m.default));
      }, []);
      return Loaded ? <Loaded {...props} /> : null;
    };
  },
}));

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({ hasPermission: (permission: string) => auth.granted.includes(permission), isLoading: false }),
}));

const idleMutation = () => ({ mutateAsync: vi.fn(), isPending: false });

vi.mock('@/hooks/use-residents', () => ({
  useResident: vi.fn(),
  useDeleteResident: () => idleMutation(),
  useUpdateResidentStatus: () => idleMutation(),
  useVerifyResident: () => ({ mutateAsync: mutations.verifyResident, isPending: false }),
}));

vi.mock('@/hooks/use-verification', () => ({
  useVerificationStatus: () => ({ data: { email: { verified: false }, phone: { verified: true } } }),
  useAdminVerifyContact: () => ({ mutateAsync: mutations.verifyContact, isPending: false }),
}));

vi.mock('@/hooks/use-wallet', () => ({
  useWallet: () => ({ data: { data: { balance: 0 } } }),
}));

vi.mock('@/components/ui/page-transition', () => ({
  PageTransition: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/residents/resident-form', () => ({ ResidentForm: () => null }));
vi.mock('@/components/residents/resident-archive-dialog', () => ({
  ResidentArchiveDialog: ({ open }: { open: boolean }) => (open ? <div role="dialog">Archive dialog</div> : null),
}));
vi.mock('@/components/residents/linked-houses', () => ({
  LinkedHouses: () => <div data-testid="overview-tab" />,
}));
vi.mock('@/components/residents/cross-property-payment-summary', () => ({
  CrossPropertyPaymentSummary: () => null,
}));
vi.mock('@/components/residents/wallet-balance', () => ({
  WalletBalance: ({ residentId }: { residentId: string }) => <div data-testid="wallet-balance">{residentId}</div>,
}));
vi.mock('@/components/residents/wallet-transactions', () => ({ WalletTransactions: () => null }));
vi.mock('@/components/residents/wallet-payment-batch-tools', () => ({ WalletPaymentBatchTools: () => null }));
vi.mock('@/components/residents/resident-payments', () => ({ ResidentPayments: () => null }));
vi.mock('@/components/residents/payment-aliases', () => ({ PaymentAliases: () => null }));
vi.mock('@/components/residents/resident-security-contacts', () => ({
  ResidentSecurityContacts: () => <div data-testid="security-tab" />,
}));
vi.mock('@/components/notes', () => ({ NotesTimeline: () => <div data-testid="notes-tab" /> }));

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

const RESIDENT = {
  id: 'r1',
  first_name: 'Ada',
  last_name: 'Obi',
  resident_code: 'R-001',
  resident_type: 'primary',
  entity_type: 'individual',
  account_status: 'active',
  verification_status: 'pending',
  email: 'ada@example.com',
  phone_primary: '+2348000000000',
  created_at: '2025-01-01T00:00:00Z',
  resident_houses: [],
};

const refetch = vi.fn();

function mockResident(state: { data?: unknown; error?: Error | null; isLoading?: boolean }) {
  vi.mocked(useResident).mockReturnValue({
    data: state.data,
    error: state.error ?? null,
    isLoading: state.isLoading ?? false,
    refetch,
  } as unknown as ReturnType<typeof useResident>);
}

// A settled thenable, so React's `use(params)` reads it without suspending.
const params = Object.assign(Promise.resolve({ id: 'r1' }), { status: 'fulfilled', value: { id: 'r1' } });
const renderPage = () => render(<ResidentDetailPage params={params} />);

beforeEach(() => {
  nav.query = '';
  auth.granted = [];
  mockResident({ data: RESIDENT });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('resident detail tabs follow the URL (#783)', () => {
  it('switches the visible tab when `?tab=` changes, as back/forward does', async () => {
    nav.query = 'tab=money';
    const { rerender } = renderPage();
    expect(await screen.findByTestId('wallet-balance')).toHaveTextContent('r1');
    expect(screen.queryByTestId('overview-tab')).not.toBeInTheDocument();

    nav.query = 'tab=security';
    rerender(<ResidentDetailPage params={params} />);
    expect(await screen.findByTestId('security-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('wallet-balance')).not.toBeInTheDocument();

    nav.query = '';
    rerender(<ResidentDetailPage params={params} />);
    expect(screen.getByTestId('overview-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('security-tab')).not.toBeInTheDocument();
  });

  it('pushes a history entry for the picked tab and drops `?tab=` for Overview', () => {
    renderPage();
    fireEvent.mouseDown(screen.getByRole('tab', { name: /money/i }), { button: 0 });
    expect(nav.push).toHaveBeenLastCalledWith('/residents/r1?tab=money', { scroll: false });

    cleanup();
    nav.query = 'tab=money';
    renderPage();
    fireEvent.mouseDown(screen.getByRole('tab', { name: /overview/i }), { button: 0 });
    expect(nav.push).toHaveBeenLastCalledWith('/residents/r1', { scroll: false });
  });

  it('opens Notes from the URL only for a notes viewer', async () => {
    nav.query = 'tab=notes';
    renderPage();
    expect(screen.getByTestId('overview-tab')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /notes/i })).not.toBeInTheDocument();

    cleanup();
    auth.granted = ['notes.view'];
    renderPage();
    expect(await screen.findByTestId('notes-tab')).toBeInTheDocument();
  });
});

describe('resident detail More menu (#783)', () => {
  const openMore = () => fireEvent.keyDown(screen.getByRole('button', { name: /more/i }), { key: 'Enter' });

  it('is absent without residents.update or residents.delete', () => {
    renderPage();
    expect(screen.queryByRole('button', { name: /more/i })).not.toBeInTheDocument();
  });

  it('offers Inactivate, not Archive, with residents.update only', async () => {
    auth.granted = ['residents.update'];
    renderPage();
    openMore();
    expect(await screen.findByRole('menuitem', { name: /inactivate/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /archive/i })).not.toBeInTheDocument();
  });

  it('offers Archive, not Inactivate, with residents.delete only, and Archive opens the archive dialog', async () => {
    auth.granted = ['residents.delete'];
    renderPage();
    openMore();
    const archive = await screen.findByRole('menuitem', { name: /archive/i });
    expect(screen.queryByRole('menuitem', { name: /inactivate/i })).not.toBeInTheDocument();

    fireEvent.click(archive);
    expect(await screen.findByText('Archive dialog')).toBeInTheDocument();
  });
});

describe('resident contact verification (#783)', () => {
  it('has no Verify contact control without residents.verify', () => {
    renderPage();
    expect(screen.queryByRole('button', { name: /verify contact/i })).not.toBeInTheDocument();
  });

  it('confirms in an AlertDialog, then verifies the unverified email and the resident', async () => {
    auth.granted = ['residents.verify'];
    const nativeConfirm = vi.spyOn(window, 'confirm');
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /verify contact/i }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Verify contact details?');
    expect(mutations.verifyContact).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^verify$/i }));
    });

    await waitFor(() => expect(mutations.verifyResident).toHaveBeenCalledWith('r1'));
    expect(mutations.verifyContact).toHaveBeenCalledTimes(1);
    expect(mutations.verifyContact).toHaveBeenCalledWith({ residentId: 'r1', contactType: 'email' });
    expect(nativeConfirm).not.toHaveBeenCalled();
  });
});

describe('resident detail load states (#783)', () => {
  it('marks the loading skeleton busy', () => {
    mockResident({ isLoading: true });
    renderPage();
    expect(screen.getByRole('status', { name: /loading resident/i })).toHaveAttribute('aria-busy', 'true');
  });

  it('reports a missing row as not found, with no retry', () => {
    mockResident({ error: new Error('Cannot coerce the result to a single JSON object') });
    renderPage();
    expect(screen.getByText('Resident not found')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
  });

  it('reports a network failure as a failure, and Try again refetches', () => {
    mockResident({ error: new Error('Failed to fetch') });
    renderPage();
    expect(screen.getByText('Could not load this resident')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
