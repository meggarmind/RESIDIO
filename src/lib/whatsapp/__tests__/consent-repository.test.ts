import { beforeEach, describe, expect, it, vi } from 'vitest';

/** #871: the Supabase side of the consent log, consent step and dispute. */
type Result = { data?: unknown; error?: unknown };

function query(result: Result = { data: null, error: null }) {
  const chain = {} as Record<string, ReturnType<typeof vi.fn>>;
  for (const m of ['select', 'eq', 'in', 'is', 'update', 'insert', 'upsert', 'order', 'limit']) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  chain.then = vi.fn((resolve: (v: unknown) => unknown) => Promise.resolve(resolve(result)));
  return chain;
}

const client = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => client }));
vi.mock('@/lib/notifications/admin-notifier', () => ({ notifyAdmins: vi.fn() }));

import { createSupabaseWhatsAppIdentityRepository } from '@/lib/whatsapp/identity';

const NUMBER = '+2348000000001';

beforeEach(() => {
  client.from.mockReset();
});

describe('Supabase consent repository', () => {
  it('reads the latest identity and privacy decisions, newest first, plus the consent step', async () => {
    const decisions = query({
      data: [
        { decision: 'privacy_accepted', notice_version: 'v2', identity_fingerprint: null },
        { decision: 'identity_confirmed', notice_version: null, identity_fingerprint: 'fp-new' },
        { decision: 'privacy_declined', notice_version: 'v1', identity_fingerprint: null },
        { decision: 'identity_disputed', notice_version: null, identity_fingerprint: 'fp-old' },
      ],
      error: null,
    });
    const session = query({ data: { consent_step: 'privacy:res-1:v2', pending_request: 'OWE' }, error: null });
    client.from.mockReturnValueOnce(decisions).mockReturnValueOnce(session);

    const state = await createSupabaseWhatsAppIdentityRepository().getConsentState('res-1', '08000000001');

    expect(client.from).toHaveBeenNthCalledWith(1, 'whatsapp_consent_decisions');
    expect(decisions.eq).toHaveBeenCalledWith('phone_number', NUMBER);
    expect(decisions.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(state).toEqual({
      confirmedFingerprint: 'fp-new',
      privacy: { decision: 'privacy_accepted', version: 'v2' },
      step: 'privacy:res-1:v2',
      pendingRequest: 'OWE',
    });
  });

  it('treats a latest dispute as unconfirmed', async () => {
    client.from
      .mockReturnValueOnce(query({ data: [{ decision: 'identity_disputed', notice_version: null, identity_fingerprint: 'fp' }], error: null }))
      .mockReturnValueOnce(query({ data: null, error: null }));

    const state = await createSupabaseWhatsAppIdentityRepository().getConsentState('res-1', NUMBER);

    expect(state.confirmedFingerprint).toBeNull();
  });

  it('logs a decision with phone, version, fingerprint and provider message id', async () => {
    const insert = query({ error: null });
    client.from.mockReturnValueOnce(insert);

    await createSupabaseWhatsAppIdentityRepository().recordConsentDecision({
      residentId: 'res-1',
      phoneNumber: '08000000001',
      decision: 'privacy_accepted',
      noticeVersion: 'v1',
      providerMessageId: 'wamid-1',
    });

    expect(insert.insert).toHaveBeenCalledWith({
      resident_id: 'res-1',
      phone_number: NUMBER,
      decision: 'privacy_accepted',
      notice_version: 'v1',
      identity_fingerprint: null,
      provider_message_id: 'wamid-1',
    });
  });

  it('fails the message when the decision cannot be logged', async () => {
    client.from.mockReturnValueOnce(query({ error: { message: 'down' } }));

    await expect(createSupabaseWhatsAppIdentityRepository().recordConsentDecision({
      residentId: 'res-1', phoneNumber: NUMBER, decision: 'identity_confirmed', identityFingerprint: 'fp', providerMessageId: 'wamid-1',
    })).rejects.toEqual({ message: 'down' });
  });

  it('updates the consent step on a live session without touching its expiry', async () => {
    const lookup = query({ data: { id: 'session-1' }, error: null });
    const update = query({ error: null });
    client.from.mockReturnValueOnce(lookup).mockReturnValueOnce(update);

    await createSupabaseWhatsAppIdentityRepository().saveConsentStep(NUMBER, 'res-1', 'identity:fp', 'OWE');

    const patch = update.update.mock.calls[0][0];
    expect(patch).toMatchObject({ consent_step: 'identity:fp', pending_request: 'OWE' });
    expect(patch).not.toHaveProperty('expires_at');
    expect(patch).not.toHaveProperty('pin_authenticated');
  });

  it('creates an already-expired session row to hold the step when none exists', async () => {
    const insert = query({ error: null });
    client.from.mockReturnValueOnce(query({ data: null, error: null })).mockReturnValueOnce(insert);
    const before = Date.now();

    await createSupabaseWhatsAppIdentityRepository().saveConsentStep(NUMBER, 'res-1', 'identity:fp', null);

    const row = insert.insert.mock.calls[0][0];
    expect(row).toMatchObject({ phone_number: NUMBER, resident_id: 'res-1', consent_step: 'identity:fp', pending_request: null });
    expect(Date.parse(row.expires_at)).toBeLessThanOrEqual(Date.now());
    expect(Date.parse(row.expires_at)).toBeGreaterThanOrEqual(before - 1000);
  });

  it('marks a number disputed against the resident and reads it back', async () => {
    const upsert = query({ error: null });
    client.from.mockReturnValueOnce(upsert).mockReturnValueOnce(query({ data: { status: 'disputed' }, error: null }));
    const repo = createSupabaseWhatsAppIdentityRepository();

    await repo.markDisputed('08000000001', 'res-1');

    expect(upsert.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ phone_number: NUMBER, status: 'disputed', resident_id: 'res-1' }),
      { onConflict: 'phone_number' }
    );
    await expect(repo.isDisputed(NUMBER)).resolves.toBe(true);
  });

  it('picks the street from a fixed house order: primary first, then oldest link, then house id', async () => {
    const houses = query({
      data: [
        { house: { street: null } },
        { house: [{ street: { name: 'Palm Street' } }] },
        { house: { street: { name: 'Oak Avenue' } } },
      ],
      error: null,
    });
    client.from.mockReturnValueOnce(houses);

    await expect(createSupabaseWhatsAppIdentityRepository().getStreetName('res-1')).resolves.toBe('Palm Street');

    expect(houses.order.mock.calls).toEqual([
      ['is_primary', { ascending: false, nullsFirst: false }],
      ['created_at', { ascending: true }],
      ['house_id', { ascending: true }],
    ]);
  });

  it('never overwrites a disputed row when attaching a linked number', async () => {
    const update = query({ error: null });
    update.neq = vi.fn().mockReturnValue(update);
    client.from.mockReturnValueOnce(update);

    await createSupabaseWhatsAppIdentityRepository().attachPendingContact('08000000001', 'res-1');

    expect(update.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'attached', resident_id: 'res-1' }));
    expect(update.eq).toHaveBeenCalledWith('phone_number', NUMBER);
    expect(update.neq).toHaveBeenCalledWith('status', 'disputed');
  });

  it.each(['pending', 'cleared', 'attached'])('does not block a %s number', async (status) => {
    client.from.mockReturnValueOnce(query({ data: { status }, error: null }));

    await expect(createSupabaseWhatsAppIdentityRepository().isDisputed(NUMBER)).resolves.toBe(false);
  });
});
