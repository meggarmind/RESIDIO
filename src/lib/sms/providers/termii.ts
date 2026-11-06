import { termiiConfig, isSmsConfigured, formatPhoneForTermii } from '@/lib/sms/termii';
import type { TermiiSendResponse } from '@/lib/sms/types';
import type { SmsProvider } from './types';

/** Upper bound on the Termii send call, so a hung API cannot hold the request open. */
const TERMII_SEND_TIMEOUT_MS = 15_000;

// `termiiConfig` is read at call time, as before the provider split.
export const termiiProvider: SmsProvider = {
  name: 'termii',
  isConfigured: () => isSmsConfigured(),
  missingConfigError: 'SMS service not configured (missing TERMII_API_KEY)',
  async send({ to, message }) {
    const response = await fetch(`${termiiConfig.baseUrl}/sms/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: termiiConfig.apiKey,
        to: formatPhoneForTermii(to),
        from: termiiConfig.senderId,
        sms: message,
        type: 'plain',
        channel: 'generic', // Can be 'generic', 'dnd' (Do Not Disturb), or 'whatsapp'
      }),
      signal: AbortSignal.timeout(TERMII_SEND_TIMEOUT_MS),
    });

    const data: TermiiSendResponse = await response.json();

    if (data.code === 'ok') {
      return {
        success: true,
        messageId: data.message_id_str || data.message_id,
        balance: data.balance,
      };
    }

    return { success: false, error: data.message || 'Unknown Termii API error' };
  },
};
