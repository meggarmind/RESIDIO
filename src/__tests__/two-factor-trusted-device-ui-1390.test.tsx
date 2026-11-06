// @vitest-environment jsdom
//
// #1390: the verify page asks "Remember this computer for 30 days?" after the second factor, and a
// remembered computer skips the second factor. The settings list has Forget and Forget all
// computers, shown only with two_factor.enable.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refreshProfile: vi.fn<() => Promise<boolean>>(),
  trusted: false,
  canEnable: true,
  computers: [] as Record<string, unknown>[],
  forget: vi.fn(),
  forgetAll: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams('next=/residents'),
}));
vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({ refreshProfile: mocks.refreshProfile, hasPermission: (p: string) => p !== 'two_factor.enable' || mocks.canEnable }),
}));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }),
      signOut: async () => ({}),
    },
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { two_factor_enabled: true, two_factor_method: 'authenticator' } }) }) }),
    }),
  }),
}));
vi.mock('@/components/ui/input-otp', () => ({
  InputOTP: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input aria-label="code" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
  InputOTPGroup: ({ children }: { children: ReactNode }) => <>{children}</>,
  InputOTPSlot: () => null,
  InputOTPSeparator: () => null,
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/hooks/use-two-factor', () => ({
  useRememberedComputers: () => ({ isLoading: false, error: null, data: mocks.computers }),
  useForgetRememberedComputer: () => ({ isPending: false, mutate: mocks.forget }),
  useForgetAllRememberedComputers: () => ({ isPending: false, mutate: mocks.forgetAll }),
}));

import { Verify2FAForm } from '@/app/auth/verify-2fa/verify-2fa-form';
import { RememberedComputers } from '@/app/(dashboard)/settings/two-factor/remembered-computers';

const defaultFetch = async (url: string) => {
  if (url === '/api/auth/2fa/trusted-device/use') return { json: async () => ({ trusted: mocks.trusted }) };
  if (url === '/api/auth/2fa/whatsapp/start') return { json: async () => ({ available: false }) };
  return { json: async () => ({ success: true, verified: true }) };
};
const fetchMock = vi.fn(defaultFetch);
const calledUrls = () => fetchMock.mock.calls.map(([u]) => u);

beforeEach(() => {
  mocks.push.mockReset();
  mocks.refreshProfile.mockReset().mockResolvedValue(true);
  mocks.trusted = false;
  mocks.canEnable = true;
  mocks.computers = [];
  mocks.forget.mockReset();
  mocks.forgetAll.mockReset();
  fetchMock.mockReset().mockImplementation(defaultFetch);
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function enterCorrectCode() {
  render(<Verify2FAForm />);
  fireEvent.change(await screen.findByLabelText('code'), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
}

describe('verify page', () => {
  it('a remembered computer enters the app without asking for a code', async () => {
    mocks.trusted = true;
    render(<Verify2FAForm />);
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/residents'));
    expect(screen.queryByLabelText('code')).toBeNull();
    expect(calledUrls()).not.toContain('/api/auth/2fa/whatsapp/start');
  });

  it('after a correct code, asks to remember the computer, with the shared-computer note', async () => {
    await enterCorrectCode();
    expect(await screen.findByText('Remember this computer for 30 days?')).toBeTruthy();
    expect(screen.getByText('Choose No on a shared or public computer.')).toBeTruthy();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('"Yes, remember it" asks the server to remember, then enters the app', async () => {
    await enterCorrectCode();
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, remember it' }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/residents'));
    expect(calledUrls()).toContain('/api/auth/2fa/trusted-device/remember');
  });

  it('a network error on "Yes, remember it" still enters the app', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/auth/2fa/trusted-device/remember') throw new TypeError('Failed to fetch');
      if (url === '/api/auth/2fa/trusted-device/use') return { json: async () => ({ trusted: false }) };
      if (url === '/api/auth/2fa/whatsapp/start') return { json: async () => ({ available: false }) };
      return { json: async () => ({ success: true, verified: true }) };
    });
    await enterCorrectCode();
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, remember it' }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/residents'));
    expect(calledUrls()).toContain('/api/auth/2fa/trusted-device/remember');
  });

  it('"No, ask me each time" enters the app without remembering', async () => {
    await enterCorrectCode();
    fireEvent.click(await screen.findByRole('button', { name: 'No, ask me each time' }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/residents'));
    expect(calledUrls()).not.toContain('/api/auth/2fa/trusted-device/remember');
  });

  it('a backup code also gets the question', async () => {
    render(<Verify2FAForm />);
    fireEvent.click(await screen.findByRole('button', { name: /Use Backup Code/ }));
    fireEvent.change(screen.getByPlaceholderText('XXXXXXXX'), { target: { value: 'ABCDEF12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByText('Remember this computer for 30 days?')).toBeTruthy();
  });
});

describe('remembered computers in settings', () => {
  const computer = (id: string, current = false) => ({
    id,
    device: 'Chrome on Windows',
    createdAt: '2026-10-01T10:00:00Z',
    lastUsedAt: '2026-10-20T10:00:00Z',
    expiresAt: '2026-10-31T10:00:00Z',
    current,
  });

  it('lists each computer with browser, date added and last used', () => {
    mocks.computers = [computer('d1', true)];
    render(<RememberedComputers />);
    expect(screen.getByText(/Chrome on Windows/)).toBeTruthy();
    expect(screen.getByText('(this computer)')).toBeTruthy();
    expect(screen.getByText(/Added 1 Oct 2026 · Last used 20 Oct 2026/)).toBeTruthy();
  });

  it('Forget and Forget all computers call their actions', () => {
    mocks.computers = [computer('d1'), computer('d2')];
    render(<RememberedComputers />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Forget' })[1]);
    expect(mocks.forget.mock.calls[0][0]).toBe('d2');
    fireEvent.click(screen.getByRole('button', { name: 'Forget all computers' }));
    expect(mocks.forgetAll).toHaveBeenCalledTimes(1);
  });

  it('shows nothing without two_factor.enable, the permission the actions check', () => {
    mocks.canEnable = false;
    mocks.computers = [computer('d1')];
    const { container } = render(<RememberedComputers />);
    expect(container.innerHTML).toBe('');
  });
});
