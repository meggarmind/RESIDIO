import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendWhatsAppPinAlert } from '@/lib/whatsapp/pin-alert';
import { createAdminClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email/send-email';
import { resolveResidentOverride } from '@/lib/comms-override/resident-flag';
import { getRawSettingsAsService } from '@/lib/settings/service';

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/email/send-email', () => ({ sendEmail: vi.fn() }));
vi.mock('@/lib/comms-override/resident-flag', () => ({ resolveResidentOverride: vi.fn() }));
vi.mock('@/lib/settings/service', () => ({ getRawSettingsAsService: vi.fn() }));

type Result = { data?: unknown; error?: unknown };
function query(result: Result) {
  const chain = {} as Record<string, ReturnType<typeof vi.fn>>;
  for (const m of ['select', 'eq', 'is']) chain[m] = vi.fn().mockReturnValue(chain);
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  chain.then = vi.fn((resolve: (v: unknown) => unknown) => Promise.resolve(resolve(result)));
  return chain;
}
function clientWith(...queries: ReturnType<typeof query>[]) {
  const from = vi.fn();
  queries.forEach((q) => from.mockReturnValueOnce(q));
  vi.mocked(createAdminClient).mockReturnValue({ from } as never);
  return from;
}

const resident = { id: 'resident-1', first_name: 'Ada', last_name: 'Okoro', email: 'ada@example.test' };

describe('WhatsApp PIN alert email (#892)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(resolveResidentOverride).mockResolvedValue({ ok: true, residentOverride: null });
    vi.mocked(getRawSettingsAsService).mockResolvedValue({ status: 'ok', values: new Map([['estate_name', 'Oak Estate']]) } as never);
    vi.mocked(sendEmail).mockResolvedValue({ success: true });
  });

  it('sends nothing when the resident has no email', async () => {
    clientWith(query({ data: { ...resident, email: null }, error: null }));
    await expect(sendWhatsAppPinAlert('resident-1', 'set', ['2348036996725'])).resolves.toEqual({ sent: false });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('emails a set alert naming the number masked, with the resident override flag', async () => {
    vi.mocked(resolveResidentOverride).mockResolvedValue({ ok: true, residentOverride: true });
    clientWith(query({ data: resident, error: null }));

    await expect(sendWhatsAppPinAlert('resident-1', 'set', ['2348036996725'])).resolves.toEqual({ sent: true });

    const options = vi.mocked(sendEmail).mock.calls[0]![0];
    expect(options).toMatchObject({
      to: { email: 'ada@example.test', name: 'Ada Okoro', residentId: 'resident-1' },
      subject: 'Your WhatsApp PIN was set',
      residentOverride: true,
      metadata: { purpose: 'whatsapp_pin_alert', event: 'set' },
    });
    const props = JSON.stringify((options.react as { props: unknown }).props);
    expect(props).toContain('234*******725');
    expect(props).not.toContain('2348036996725');
  });

  it('names the linked numbers on a reset from the dashboard', async () => {
    const links = query({ data: [{ phone_number: '2348036996725' }], error: null });
    clientWith(query({ data: resident, error: null }), links);

    await sendWhatsAppPinAlert('resident-1', 'reset');

    expect(links.eq).toHaveBeenCalledWith('resident_id', 'resident-1');
    expect(links.is).toHaveBeenCalledWith('deactivated_at', null);
    const options = vi.mocked(sendEmail).mock.calls[0]![0];
    expect(options.subject).toBe('Your WhatsApp PIN was reset');
    expect(JSON.stringify((options.react as { props: unknown }).props)).toContain('234*******725');
  });

  it('sends nothing and throws when the override flag cannot be read', async () => {
    vi.mocked(resolveResidentOverride).mockResolvedValue({ ok: false, error: 'flag unreadable' });
    clientWith(query({ data: resident, error: null }));
    await expect(sendWhatsAppPinAlert('resident-1', 'change', ['2348036996725'])).rejects.toThrow('flag unreadable');
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('throws when the send fails', async () => {
    vi.mocked(sendEmail).mockResolvedValue({ success: false, error: 'Resend down' });
    clientWith(query({ data: resident, error: null }));
    await expect(sendWhatsAppPinAlert('resident-1', 'change', ['2348036996725'])).rejects.toThrow('Resend down');
  });
});
