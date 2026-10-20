/**
 * Issue #6 — enqueue-time WhatsApp consent helper. Uses the real
 * normalizePhoneNumber; only the Supabase client is faked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: mocks.createAdminClient }));

import { isWhatsAppOptedIn } from '../opt-in';

function clientReturning(result: { data: unknown; error: unknown }) {
  const eq = vi.fn();
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = eq.mockImplementation(() => chain);
  chain.is = vi.fn(() => chain);
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  const from = vi.fn(() => chain);
  mocks.createAdminClient.mockReturnValue({ from });
  return { from, eq };
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

describe('isWhatsAppOptedIn (#6)', () => {
  it('is true when an opted-in row exists, querying the consent table by resident, phone and opted_in', async () => {
    const { from, eq } = clientReturning({ data: { id: 'o1' }, error: null });

    await expect(isWhatsAppOptedIn('res-1', '+2348000000000')).resolves.toBe(true);

    expect(from).toHaveBeenCalledWith('whatsapp_optins');
    expect(eq).toHaveBeenCalledWith('resident_id', 'res-1');
    expect(eq).toHaveBeenCalledWith('phone_number', '+2348000000000');
    expect(eq).toHaveBeenCalledWith('opted_in', true);
  });

  it('is false when there is no opted-in row (opted out or never opted in)', async () => {
    clientReturning({ data: null, error: null });

    await expect(isWhatsAppOptedIn('res-1', '+2348000000000')).resolves.toBe(false);
  });

  it('fails closed and logs context when the query errors', async () => {
    const dbError = { message: 'boom' };
    clientReturning({ data: { id: 'o1' }, error: dbError });

    await expect(isWhatsAppOptedIn('res-1', '+2348000000000')).resolves.toBe(false);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('opt-in lookup failed'),
      expect.objectContaining({ residentId: 'res-1', error: dbError })
    );
  });

  it('normalises the phone number the same way the send path does', async () => {
    const { eq } = clientReturning({ data: { id: 'o1' }, error: null });

    await isWhatsAppOptedIn('res-1', '0800 000 0000');

    expect(eq).toHaveBeenCalledWith('phone_number', '+2348000000000');
  });
});
