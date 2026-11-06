import { formatPhoneForTermii } from '@/lib/sms/termii';
import type { SmsProvider, SmsProviderSendResult } from './types';

/**
 * HollaTags SMS provider (#1462). Send only: no delivery-report callback.
 * API: POST https://sms.hollatags.com/api/send/ (form-encoded; replies in plain text).
 */

export const HOLLATAGS_SEND_URL = 'https://sms.hollatags.com/api/send/';
const HOLLATAGS_SEND_TIMEOUT_MS = 15_000;
export const HOLLATAGS_MAX_MESSAGE_LENGTH = 905;
export const HOLLATAGS_MAX_SENDER_ID_LENGTH = 11;

/** Credentials are read from the environment at call time. */
function hollatagsConfig() {
  return {
    username: process.env.HOLLATAGS_USERNAME || '',
    password: process.env.HOLLATAGS_PASSWORD || '',
    senderId: process.env.HOLLATAGS_SENDER_ID || 'Residio',
  };
}

const ERROR_MESSAGES: Record<string, string> = {
  error_param: 'missing or invalid parameters',
  error_credit: 'insufficient HollaTags credit',
  error_billing: 'HollaTags could not debit the account (temporary)',
  error_gw: 'HollaTags gateway unavailable',
  error_user: 'invalid HollaTags username/password or suspended account',
  error_limit: 'invalid number or too many recipients',
};

// `<digits>,<id>` entries joined by `~~`
const SUCCESS_ENTRIES = /^\d+,[^~,\s]+(~~\d+,[^~,\s]+)*$/;

// GSM 7-bit basic set plus its extension table. Anything else needs type 2 (unicode).
const GSM_7 =
  /^[A-Za-z0-9 \r\n@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/;

function parseResponse(body: string): SmsProviderSendResult {
  if (body === 'sent') return { success: true };
  if (SUCCESS_ENTRIES.test(body)) {
    return { success: true, messageId: body.split('~~')[0].split(',')[1] };
  }
  if (body.startsWith('error_')) {
    const token = body.split(/\s/)[0];
    const reason = ERROR_MESSAGES[token];
    return { success: false, error: reason ? `HollaTags error: ${reason} (${token})` : `HollaTags error (${token})` };
  }
  return { success: false, error: 'Unexpected HollaTags response' };
}

export const hollatagsProvider: SmsProvider = {
  name: 'hollatags',
  isConfigured: () => {
    const { username, password } = hollatagsConfig();
    return !!username && !!password;
  },
  missingConfigError: 'SMS service not configured (missing HOLLATAGS_USERNAME or HOLLATAGS_PASSWORD)',
  async send({ to, message }) {
    const { username, password, senderId } = hollatagsConfig();

    if (message.length > HOLLATAGS_MAX_MESSAGE_LENGTH) {
      return {
        success: false,
        error: `Message is too long for HollaTags (${message.length} characters, maximum ${HOLLATAGS_MAX_MESSAGE_LENGTH})`,
      };
    }
    if (senderId.length > HOLLATAGS_MAX_SENDER_ID_LENGTH) {
      return {
        success: false,
        error: `HOLLATAGS_SENDER_ID is too long (${senderId.length} characters, maximum ${HOLLATAGS_MAX_SENDER_ID_LENGTH})`,
      };
    }

    const response = await fetch(HOLLATAGS_SEND_URL, {
      method: 'POST',
      body: new URLSearchParams({
        user: username,
        pass: password,
        from: senderId,
        to: formatPhoneForTermii(to),
        msg: message,
        type: GSM_7.test(message) ? '0' : '2',
        enable_msg_id: 'TRUE',
        message_uuid: crypto.randomUUID(),
      }),
      signal: AbortSignal.timeout(HOLLATAGS_SEND_TIMEOUT_MS),
    });

    // HollaTags answers HTTP 200 with a plain-text body, even for errors.
    const body = (await response.text()).trim();
    if (!response.ok) {
      return { success: false, error: `HollaTags request failed with status ${response.status}` };
    }
    return parseResponse(body);
  },
};
