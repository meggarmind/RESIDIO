// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ProfileLoadResult } from '@/lib/auth/access-load';

/**
 * #1341: after a correct two-factor code the screen loads the user's access, behind a loading
 * state, before it opens the app. A failed load shows an error and Try again.
 */

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  refreshProfile: vi.fn<() => Promise<ProfileLoadResult>>(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
  useSearchParams: () => new URLSearchParams('next=/residents'),
}));
vi.mock('@/lib/auth/auth-provider', () => ({ useAuth: () => ({ refreshProfile: mocks.refreshProfile }) }));
vi.mock('@/lib/auth/access-load', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/access-load')>();
  // No real waits between retries in tests.
  return { ...actual, loadAccessWithRetry: (load: () => Promise<ProfileLoadResult>) => actual.loadAccessWithRetry(load, { wait: () => Promise.resolve() }) };
});
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }),
      signOut: vi.fn(),
    },
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: { two_factor_enabled: true, two_factor_method: 'authenticator' } }) }),
      }),
    }),
  }),
}));
// The OTP widget needs browser APIs jsdom lacks; a plain input is enough here.
vi.mock('@/components/ui/input-otp', () => ({
  InputOTP: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input aria-label="code" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
  InputOTPGroup: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  InputOTPSlot: () => null,
  InputOTPSeparator: () => null,
}));

import { Verify2FAForm } from '@/app/auth/verify-2fa/verify-2fa-form';

async function submitCorrectCode() {
  render(<Verify2FAForm />);
  const input = await screen.findByLabelText('code');
  fireEvent.change(input, { target: { value: '123456' } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
  });
}

describe('Verify2FAForm access load (#1341)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ success: true }) })));
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('shows a loading state and opens the app only after access is loaded', async () => {
    let finish!: (r: ProfileLoadResult) => void;
    mocks.refreshProfile.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await submitCorrectCode();

    expect(screen.getByRole('status')).toHaveTextContent('Loading your access');
    expect(mocks.replace).not.toHaveBeenCalled();

    await act(async () => finish('loaded'));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/residents'));
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('shows an error and Try again when access cannot be loaded, and retries on click', async () => {
    mocks.refreshProfile.mockResolvedValue('failed');
    await submitCorrectCode();

    expect(await screen.findByText(/could not load your access/i)).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.refreshProfile).toHaveBeenCalledTimes(3);

    mocks.refreshProfile.mockResolvedValue('loaded');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    });
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/residents'));
  });
});
