/**
 * #908 -- Chatmaid renders payment reminders and receipts from editable wording.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createChatmaidWhatsAppProvider } from '@/lib/whatsapp/providers/chatmaid';
import { getEventDefaults, renderEventText } from '@/lib/notifications/event-content-registry';
import type { ChatmaidWhatsAppConfig } from '@/lib/whatsapp/config';

const { createAdminClient } = vi.hoisted(() => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient }));

let counter = 0;
function makeConfig(): ChatmaidWhatsAppConfig {
  counter += 1;
  return {
    provider: 'chatmaid',
    apiKey: 'sk_test_key',
    webhookSecret: 'whsec_test',
    fromNumber: '+2348037000101',
    baseUrl: `https://developers-api.chatmaid.test/wording-${counter}`,
  };
}

/** Answers the two connection-check calls, then the send. Returns the sent `content`. */
async function sendTemplate(templateName: string, parameters: string[]) {
  const config = makeConfig();
  const fetchImpl = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'phone-1', e164: config.fromNumber }] })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ connectionStatus: 'connected' })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: 'msg' } }), { status: 201 }));
  const provider = createChatmaidWhatsAppProvider(config, fetchImpl);
  await provider.sendTemplate({ to: '+2348000000000', templateName, languageCode: 'en_US', parameters });
  return JSON.parse((fetchImpl.mock.calls[2][1] as RequestInit).body as string).content as string;
}

function stubOverrides(overrides: unknown) {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.maybeSingle = async () => ({ data: { overrides }, error: null });
  createAdminClient.mockReturnValue({ from: () => chain });
}

describe('Chatmaid wording (#908)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    stubOverrides({});
  });

  it('with no override the text is exactly what the old hard-coded renderers produced', async () => {
    expect(await sendTemplate('invoice_reminder', ['Ada', 'INV-001', 'NGN 10,000', '1 Sep'])).toBe(
      'Hi Ada, invoice INV-001 for NGN 10,000 is due 1 Sep. Please make payment at your earliest convenience.'
    );
    expect(await sendTemplate('payment_received', ['Ada', 'NGN 5,000', '01 Sep 2026', 'REF'])).toBe(
      "Hi Ada, we've received your payment of NGN 5,000 on 01 Sep 2026 (Ref: REF). Thank you."
    );
  });

  it('empty parameters degrade the way the old renderers did', async () => {
    expect(await sendTemplate('invoice_reminder', ['', '', '', ''])).toBe(
      'Hi there, invoice  for  is due soon. Please make payment at your earliest convenience.'
    );
    expect(await sendTemplate('payment_received', ['', '', '', ''])).toBe(
      "Hi there, we've received your payment of  on  (Ref: Not provided). Thank you."
    );
  });

  it('a stored override reaches the Chatmaid send body with named variables filled in', async () => {
    stubOverrides({ body: 'Dear {{resident_name}}: {{invoice_number}} ({{amount}}) is due {{due_date}}.' });
    expect(await sendTemplate('invoice_reminder', ['Ada', 'INV-001', 'NGN 10,000', '1 Sep'])).toBe(
      'Dear Ada: INV-001 (NGN 10,000) is due 1 Sep.'
    );
    stubOverrides({ body: 'Got {{amount}} ({{reference_number}}) on {{payment_date}}' });
    expect(await sendTemplate('payment_received', ['Ada', 'NGN 5,000', '01 Sep 2026', 'REF'])).toBe(
      'Got NGN 5,000 (REF) on 01 Sep 2026'
    );
  });

  it('falls back to the default text when the wording cannot be read', async () => {
    createAdminClient.mockImplementation(() => {
      throw new Error('no db');
    });
    expect(await sendTemplate('payment_received', ['Ada', 'NGN 5,000', '01 Sep 2026', 'REF'])).toBe(
      renderEventText(getEventDefaults('payment_receipt', 'whatsapp').body, {
        resident_name: 'Ada',
        amount: 'NGN 5,000',
        payment_date: '01 Sep 2026',
        reference_number: 'REF',
      })
    );
  });

  it('announcements and unmapped templates keep the code path and never read the wording', async () => {
    expect(await sendTemplate('announcement', ['Water', 'Off today'])).toBe('Water\n\nOff today');
    expect(await sendTemplate('something_else', ['a', 'b'])).toBe('a b');
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});
