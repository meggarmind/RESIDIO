// @vitest-environment jsdom
//
// #1389: the verify page's WhatsApp approval. It shows the number, waits for the answer, enters the
// app on approval, signs out on a block, and keeps the authenticator and backup code paths.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refreshProfile: vi.fn<() => Promise<boolean>>(),
  signOut: vi.fn(async () => ({})),
  statuses: [] as Record<string, unknown>[],
  start: { available: true, success: true, code: '47', expiresAt: '', pollSent: true, message: 'Tap this number in WhatsApp. If you cannot tap, type 47 in the chat.' } as Record<string, unknown>,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams('next=/residents'),
}));
vi.mock('@/lib/auth/auth-provider', () => ({ useAuth: () => ({ refreshProfile: mocks.refreshProfile }) }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }),
      signOut: mocks.signOut,
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

import { Verify2FAForm } from '@/app/auth/verify-2fa/verify-2fa-form';

const fetchMock = vi.fn(async (url: string) => {
  if (url === '/api/auth/2fa/whatsapp/start') return { json: async () => mocks.start };
  if (url === '/api/auth/2fa/whatsapp/status') return { json: async () => mocks.statuses.shift() ?? { status: 'pending' } };
  return { json: async () => ({ success: true }) };
});

beforeEach(() => {
  mocks.push.mockReset();
  mocks.signOut.mockClear();
  mocks.refreshProfile.mockReset().mockResolvedValue(true);
  mocks.statuses = [];
  mocks.start = { ...mocks.start, available: true, success: true, expiresAt: new Date(Date.now() + 120_000).toISOString() };
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Verify2FAForm with WhatsApp approval (#1389)', () => {
  it('shows the number, the tap-or-type line, the countdown and the three links', async () => {
    render(<Verify2FAForm />);
    expect((await screen.findByLabelText('Number to tap')).textContent).toBe('47');
    expect(screen.getByText('Tap this number in WhatsApp. If you cannot tap, type 47 in the chat.')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/^Waiting for your answer\. [12]:\d\d left\.$/);
    for (const name of ['Send the WhatsApp message again', 'Use my authenticator code', 'Use a backup code']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
  });

  it('enters the app after the server reports approval', async () => {
    mocks.statuses = [{ status: 'pending' }, { status: 'approved' }];
    render(<Verify2FAForm />);
    await screen.findByLabelText('Number to tap');
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/residents'), { timeout: 6000 });
    expect(mocks.refreshProfile).toHaveBeenCalled();
  }, 10000);

  it('on a block, shows "Sign-in blocked" and signs out', async () => {
    mocks.statuses = [{ status: 'denied' }];
    render(<Verify2FAForm />);
    expect(await screen.findByText('Sign-in blocked', undefined, { timeout: 4000 })).toBeTruthy();
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.push).not.toHaveBeenCalledWith('/residents');
  }, 8000);

  it('"Use my authenticator code" opens the code entry', async () => {
    render(<Verify2FAForm />);
    fireEvent.click(await screen.findByRole('button', { name: 'Use my authenticator code' }));
    expect(await screen.findByLabelText('code')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Approve on WhatsApp instead/ })).toBeTruthy();
  });

  it('"Use a backup code" opens the backup code entry', async () => {
    render(<Verify2FAForm />);
    fireEvent.click(await screen.findByRole('button', { name: 'Use a backup code' }));
    expect(await screen.findByText('Enter Backup Code')).toBeTruthy();
  });

  it('"Cancel and Sign Out" closes the WhatsApp request before signing out', async () => {
    render(<Verify2FAForm />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel and Sign Out' }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/login'));
    expect(fetchMock.mock.calls.map(([u]) => u)).toContain('/api/auth/2fa/whatsapp/cancel');
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });

  it('shows the code entry when the account does not use WhatsApp approval', async () => {
    mocks.start = { available: false };
    render(<Verify2FAForm />);
    expect(await screen.findByLabelText('code')).toBeTruthy();
    expect(screen.queryByLabelText('Number to tap')).toBeNull();
    expect(screen.queryByRole('button', { name: /Approve on WhatsApp instead/ })).toBeNull();
  });
});
