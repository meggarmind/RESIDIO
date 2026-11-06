// @vitest-environment jsdom
//
// #1464: while SMS is off no code can arrive, so the verify page must not show a 6-digit code input,
// Resend or the toggle back. It explains and offers the backup code. Email is unchanged.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const mocks = vi.hoisted(() => ({ method: 'sms' as string }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/lib/auth/auth-provider', () => ({ useAuth: () => ({ refreshProfile: vi.fn(async () => true) }) }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }),
      signOut: vi.fn(async () => ({})),
    },
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: { two_factor_enabled: true, two_factor_method: mocks.method } }) }),
      }),
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
vi.mock('@/lib/notifications/types', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/notifications/types')>();
  return {
    ...actual,
    isChannelImplemented: (c: string) => (c === 'sms' ? false : actual.isChannelImplemented(c as never)),
  };
});

import { Verify2FAForm } from '@/app/auth/verify-2fa/verify-2fa-form';

const fetchMock = vi.fn(async (url: string) => {
  if (url === '/api/auth/2fa/whatsapp/start') return { json: async () => ({ available: false }) };
  if (url === '/api/auth/2fa/trusted-device/use') return { json: async () => ({ trusted: false }) };
  return { json: async () => ({ success: true }) };
});
const urls = () => fetchMock.mock.calls.map((c) => c[0]);

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Verify2FAForm with SMS off (#1464)', () => {
  it('explains, offers only the backup code, and shows no 6-digit input, Resend or toggle back', async () => {
    mocks.method = 'sms';
    render(<Verify2FAForm />);
    expect(await screen.findByText('Enter Backup Code')).toBeTruthy();
    expect(screen.getAllByText('SMS codes are switched off. Sign in with a backup code.').length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText('XXXXXXXX')).toBeTruthy();
    expect(screen.queryByLabelText('code')).toBeNull();
    expect(screen.queryByText('Enter the 6-digit code sent to your phone.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Resend Code' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Use Verification Code/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Use Backup Code/ })).toBeNull();
    // The one Verify button submits the backup code, so it stays disabled until 8 characters are typed.
    expect((screen.getByRole('button', { name: 'Verify' }) as HTMLButtonElement).disabled).toBe(true);
    await waitFor(() => expect(urls()).toContain('/api/auth/2fa/trusted-device/use'));
    await waitFor(() => expect(urls()).toContain('/api/auth/2fa/whatsapp/start'));
    expect(urls()).not.toContain('/api/auth/2fa/send-code');
  });

  it('keeps the code input and sends the code for an email profile', async () => {
    mocks.method = 'email';
    render(<Verify2FAForm />);
    expect(await screen.findByLabelText('code')).toBeTruthy();
    expect(screen.getByText('Enter the 6-digit code sent to your email.')).toBeTruthy();
    expect(screen.queryByText(/SMS codes are switched off/)).toBeNull();
    await waitFor(() => expect(urls()).toContain('/api/auth/2fa/send-code'));
  });
});
