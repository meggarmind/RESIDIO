/**
 * #908 -- Chatmaid renders payment reminders and receipts from editable wording.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createChatmaidWhatsAppProvider } from '@/lib/whatsapp/providers/chatmaid';
import { getEventDefaults, renderEventText } from '@/lib/notifications/event-content-registry';
import type { ChatmaidWhatsAppConfig } from '@/lib/whatsapp/config';
import { formatNotice } from '@/lib/whatsapp/notice-format';

const { createAdminClient } = vi.hoisted(() => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient }));
vi.mock('@/lib/settings/service', () => ({
  getRawSettingsAsService: async () => ({ status: 'ok', values: new Map([['estate_name', 'Opera Estate']]) }),
}));

const receipt = (body: string) => formatNotice('payment_received', body, 'Opera Estate');
const reminder = (body: string) => formatNotice('payment_reminder', body, 'Opera Estate');

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

  it('with no override the default wording is one field per line, inside the notice header and footer (#1351)', async () => {
    expect(await sendTemplate('invoice_reminder', ['Ada', 'INV-001', 'NGN 10,000', '1 Sep'])).toBe(
      reminder('Hi Ada, please pay this invoice.\n\nInvoice: INV-001\nAmount: *NGN 10,000*\nDue: 1 Sep')
    );
    expect(await sendTemplate('payment_received', ['Ada', 'NGN 5,000', '01 Sep 2026', 'REF'])).toBe(
      receipt('Hi Ada, we have received your payment. Thank you.\n\nAmount: *NGN 5,000*\nDate: 01 Sep 2026\nReference: REF')
    );
  });

  it('empty parameters fall back to readable words', async () => {
    expect(await sendTemplate('invoice_reminder', ['', '', '', ''])).toBe(
      reminder('Hi there, please pay this invoice.\n\nInvoice: \nAmount: **\nDue: soon')
    );
    expect(await sendTemplate('payment_received', ['', '', '', ''])).toBe(
      receipt('Hi there, we have received your payment. Thank you.\n\nAmount: **\nDate: \nReference: Not provided')
    );
  });

  it('a stored override reaches the Chatmaid send body with named variables filled in', async () => {
    stubOverrides({ body: 'Dear {{resident_name}}: {{invoice_number}} ({{amount}}) is due {{due_date}}.' });
    expect(await sendTemplate('invoice_reminder', ['Ada', 'INV-001', 'NGN 10,000', '1 Sep'])).toBe(
      reminder('Dear Ada: INV-001 (NGN 10,000) is due 1 Sep.')
    );
    stubOverrides({ body: 'Got {{amount}} ({{reference_number}}) on {{payment_date}}' });
    expect(await sendTemplate('payment_received', ['Ada', 'NGN 5,000', '01 Sep 2026', 'REF'])).toBe(
      receipt('Got NGN 5,000 (REF) on 01 Sep 2026')
    );
  });

  it('falls back to the default text when the wording cannot be read', async () => {
    createAdminClient.mockImplementation(() => {
      throw new Error('no db');
    });
    expect(await sendTemplate('payment_received', ['Ada', 'NGN 5,000', '01 Sep 2026', 'REF'])).toBe(
      receipt(renderEventText(getEventDefaults('payment_receipt', 'whatsapp').body, {
        resident_name: 'Ada',
        amount: 'NGN 5,000',
        payment_date: '01 Sep 2026',
        reference_number: 'REF',
      }))
    );
  });

  it('announcements and unmapped templates keep the code path and never read the wording', async () => {
    expect(await sendTemplate('announcement', ['Water', 'Off today'])).toBe(
      formatNotice('announcement', '*Water*\n\nOff today', 'Opera Estate')
    );
    // No notice kind for an unmapped template: it is sent as rendered, with no header.
    expect(await sendTemplate('something_else', ['a', 'b'])).toBe('a b');
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});
