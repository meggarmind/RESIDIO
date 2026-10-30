// @vitest-environment jsdom
//
// #1341: after a correct 2FA code the form must load the user's access before
// it enters the app. It shows "Loading your access" meanwhile, retries, and on
// failure shows an error with Retry, never the app with an empty menu.

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refreshProfile: vi.fn<() => Promise<boolean>>(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams('next=/residents'),
}));

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({ refreshProfile: mocks.refreshProfile }),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }),
      signOut: async () => ({}),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { two_factor_enabled: true, two_factor_method: 'authenticator' },
          }),
        }),
      }),
    }),
  }),
}));

// The OTP widget is not under test; a plain input drives the same onChange.
vi.mock('@/components/ui/input-otp', () => ({
  InputOTP: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input aria-label="code" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
  InputOTPGroup: ({ children }: { children: ReactNode }) => <>{children}</>,
  InputOTPSlot: () => null,
  InputOTPSeparator: () => null,
}));

import { Verify2FAForm } from '@/app/auth/verify-2fa/verify-2fa-form';

async function submitCorrectCode() {
  render(<Verify2FAForm />);
  const input = await screen.findByLabelText('code');
  fireEvent.change(input, { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
}

describe('Verify2FAForm loads access before entering the app (#1341)', () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.refreshProfile.mockReset();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ json: async () => ({ success: true }) }))
    );
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shows "Loading your access" and enters the app only after access loads', async () => {
    let finishLoad: (ok: boolean) => void = () => {};
    mocks.refreshProfile.mockImplementation(
      () => new Promise<boolean>((resolve) => { finishLoad = resolve; })
    );

    await submitCorrectCode();

    expect(await screen.findByText('Loading your access')).toBeTruthy();
    expect(mocks.push).not.toHaveBeenCalled();

    await act(async () => finishLoad(true));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/residents'));
    expect(mocks.refreshProfile).toHaveBeenCalledTimes(1);
  });

  it('retries a failed load and enters the app when a later attempt succeeds', async () => {
    mocks.refreshProfile.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await submitCorrectCode();

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/residents'), { timeout: 3000 });
    expect(mocks.refreshProfile).toHaveBeenCalledTimes(2);
  });

  it('after every attempt fails, shows an error and Retry instead of entering the app', async () => {
    mocks.refreshProfile.mockResolvedValue(false);

    await submitCorrectCode();

    expect(await screen.findByText(/could not load your access/i, undefined, { timeout: 5000 })).toBeTruthy();
    expect(mocks.refreshProfile).toHaveBeenCalledTimes(3);
    expect(mocks.push).not.toHaveBeenCalled();

    mocks.refreshProfile.mockResolvedValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/residents'));
  }, 10000);

  it('a wrong code neither loads access nor enters the app', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ json: async () => ({ success: false, message: 'Invalid code' }) }))
    );

    await submitCorrectCode();

    expect(await screen.findByText('Invalid code')).toBeTruthy();
    expect(mocks.refreshProfile).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
