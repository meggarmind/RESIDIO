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

  /** Opens the backup codes dialog with these codes, through Make new backup codes. */
  const showCodes = (codes: string[]) => {
    mocks.status = on;
    render(<TwoFactorControls />);
    fireEvent.click(screen.getByRole('button', { name: 'Make new backup codes' }));
    typeCode('111222');
    fireEvent.click(screen.getByRole('button', { name: 'Make new codes' }));
    const [, opts] = mocks.hooks.regenerate.mutate.mock.calls[0] as [string, MutateOptions];
    act(() => opts.onSuccess?.({ success: true, codes }));
  };

  describe('saving the backup codes', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
      Object.assign(navigator, { canShare: undefined, share: undefined });
    });

    it('saves the codes as a text file', async () => {
      let saved: Blob | null = null;
      vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn((blob: Blob) => { saved = blob; return 'blob:codes'; }), revokeObjectURL: vi.fn() });
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      showCodes(['CCCC3333', 'DDDD4444']);

      fireEvent.click(screen.getByRole('button', { name: 'Save as file' }));

      expect(click).toHaveBeenCalledTimes(1);
      expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('residio-backup-codes.txt');
      const text = await (saved as unknown as Blob).text();
      expect(text.split('\n')).toEqual(expect.arrayContaining(['CCCC3333', 'DDDD4444']));
    });

    it('offers Share only when the device can share a file, and shares the codes file', async () => {
      const share = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { canShare: () => true, share });
      showCodes(['EEEE5555']);

      fireEvent.click(screen.getByRole('button', { name: 'Share' }));

      const [data] = share.mock.calls[0] as [{ files: File[] }];
      expect(data.files[0].name).toBe('residio-backup-codes.txt');
      expect(await data.files[0].text()).toContain('EEEE5555');
    });

    it('says nothing when the share sheet is closed, and shows an error when sharing fails', async () => {
      const { toast } = await import('sonner');
      vi.mocked(toast.error).mockClear();
      const share = vi.fn().mockRejectedValueOnce(new DOMException('closed', 'AbortError')).mockRejectedValueOnce(new Error('denied'));
      Object.assign(navigator, { canShare: () => true, share });
      showCodes(['GGGG7777']);

      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Share' })); });
      expect(toast.error).not.toHaveBeenCalled();

      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Share' })); });
      expect(toast.error).toHaveBeenCalledWith('Could not share. Save the file instead.');
    });

    it('hides Share when the device cannot share a file', () => {
      Object.assign(navigator, { canShare: () => false, share: vi.fn() });
      showCodes(['FFFF6666']);
      expect(screen.getByRole('button', { name: 'Save as file' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument();
    });
  });

  it('hides Turn off without the disable permission', () => {
    mocks.status = on;
    mocks.canDisable = false;
    render(<TwoFactorControls />);
    expect(screen.queryByRole('button', { name: 'Turn off' })).not.toBeInTheDocument();
  });
});
