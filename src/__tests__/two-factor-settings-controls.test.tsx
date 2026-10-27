// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QRCodeSVG } from 'qrcode.react';

/**
 * #1029: the Settings screen that turns two-factor login on and off for the signed-in admin.
 */

type MutateOptions = { onSuccess?: (result: unknown) => void; onError?: (error: Error) => void };
const mutation = () => ({ isPending: false, mutate: vi.fn() as ReturnType<typeof vi.fn> });

const mocks = vi.hoisted(() => ({
  status: {} as Record<string, unknown>,
  canDisable: true,
  hooks: {} as Record<string, { isPending: boolean; mutate: ReturnType<typeof vi.fn> }>,
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({ hasPermission: (p: string) => p !== 'two_factor.disable' || mocks.canDisable }),
}));
vi.mock('@/hooks/use-two-factor', () => ({
  useTwoFactorStatus: () => ({ isLoading: false, error: null, data: mocks.status }),
  useInitiate2FASetup: () => mocks.hooks.initiate,
  useConfirm2FASetup: () => mocks.hooks.confirm,
  useDisable2FA: () => mocks.hooks.disable,
  useRequestDisableCode: () => mocks.hooks.requestDisable,
  useGenerateBackupCodes: () => mocks.hooks.regenerate,
}));

import { TwoFactorControls } from '@/app/(dashboard)/settings/two-factor/two-factor-controls';

const off = { enabled: false, method: null, verifiedAt: null, backupCodesRemaining: 0 };
const on = { enabled: true, method: 'authenticator', verifiedAt: '2026-10-20T09:00:00Z', backupCodesRemaining: 7 };

beforeEach(() => {
  mocks.canDisable = true;
  mocks.hooks = {
    initiate: mutation(),
    confirm: mutation(),
    disable: mutation(),
    requestDisable: mutation(),
    regenerate: mutation(),
  };
});
afterEach(cleanup);

/** The path of a QR code drawn for `value`, to compare against what the screen draws. */
const qrPath = (value: string) => {
  const markup = renderToStaticMarkup(<QRCodeSVG value={value} />);
  return [...markup.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]).pop();
};

const typeCode = (code: string) =>
  fireEvent.change(screen.getByLabelText('Code from your authenticator app'), { target: { value: code } });

describe('two-factor settings controls', () => {
  it('sets up an authenticator app and shows the backup codes once', () => {
    mocks.status = off;
    render(<TwoFactorControls />);

    fireEvent.click(screen.getByRole('button', { name: 'Set up authenticator app' }));
    const [input, opts] = mocks.hooks.initiate.mutate.mock.calls[0] as [unknown, MutateOptions];
    expect(input).toEqual({ method: 'authenticator' });
    act(() => opts.onSuccess?.({ success: true, secret: 'JBSWY3DPEHPK3PXP', qrCode: 'otpauth://totp/Estate:a?secret=JBSWY3DPEHPK3PXP' }));

    expect(screen.getByLabelText('Setup key')).toHaveTextContent('JBSW Y3DP EHPK 3PXP');
    expect(screen.getByRole('link', { name: /open in an authenticator app/i })).toHaveAttribute(
      'href',
      'otpauth://totp/Estate:a?secret=JBSWY3DPEHPK3PXP'
    );

    // The QR code holds the same otpauth link, so scanning it adds the same key.
    const qr = screen.getByRole('img', { name: 'QR code for your authenticator app' });
    const drawn = [...qr.querySelectorAll('path')].map((p) => p.getAttribute('d')).pop();
    expect(drawn).toBe(qrPath('otpauth://totp/Estate:a?secret=JBSWY3DPEHPK3PXP'));
    expect(drawn).not.toBe(qrPath('otpauth://totp/Estate:a?secret=AAAAAAAAAAAAAAAA'));

    const turnOn = screen.getByRole('button', { name: 'Turn on' });
    expect(turnOn).toBeDisabled();
    typeCode('12a3456');
    expect(turnOn).toBeEnabled();
    fireEvent.click(turnOn);
    const [confirmInput, confirmOpts] = mocks.hooks.confirm.mutate.mock.calls[0] as [unknown, MutateOptions];
    expect(confirmInput).toEqual({ code: '123456', method: 'authenticator' });
    act(() => confirmOpts.onSuccess?.({ success: true, backupCodes: ['AAAA1111', 'BBBB2222'] }));

    expect(screen.getByRole('list', { name: 'Backup codes' })).toHaveTextContent('AAAA1111');
    expect(screen.getByText(/shown only now/i)).toBeInTheDocument();
  });

  it('turns two-factor off only with a code', () => {
    mocks.status = on;
    render(<TwoFactorControls />);
    expect(screen.getByText(/7 unused backup codes left/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Turn off' }));
    const submit = screen.getAllByRole('button', { name: 'Turn off' }).at(-1)!;
    expect(submit).toBeDisabled();
    typeCode('654321');
    fireEvent.click(submit);
    expect(mocks.hooks.disable.mutate.mock.calls[0][0]).toBe('654321');
  });

  it('makes new backup codes with a code and shows them', () => {
    mocks.status = on;
    render(<TwoFactorControls />);
    fireEvent.click(screen.getByRole('button', { name: 'Make new backup codes' }));
    typeCode('111222');
    fireEvent.click(screen.getByRole('button', { name: 'Make new codes' }));
    const [code, opts] = mocks.hooks.regenerate.mutate.mock.calls[0] as [string, MutateOptions];
    expect(code).toBe('111222');
    act(() => opts.onSuccess?.({ success: true, codes: ['CCCC3333'] }));
    expect(screen.getByRole('list', { name: 'Backup codes' })).toHaveTextContent('CCCC3333');
  });

  it('hides Turn off without the disable permission', () => {
    mocks.status = on;
    mocks.canDisable = false;
    render(<TwoFactorControls />);
    expect(screen.queryByRole('button', { name: 'Turn off' })).not.toBeInTheDocument();
  });
});
