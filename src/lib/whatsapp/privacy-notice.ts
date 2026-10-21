import { getConfiguredPublicOrigin } from '@/lib/http/public-origin';
import { getRawSettingsAsService } from '@/lib/settings/service';

export const PRIVACY_NOTICE_VERSION_KEY = 'whatsapp_privacy_notice_version';
export const PRIVACY_NOTICE_TEXT_KEY = 'whatsapp_privacy_notice_text';

export interface WhatsAppPrivacyNotice {
  version: string;
  text: string;
}

function settingText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Fills the admin placeholders. Matching is exact and case-sensitive; unknown `{{...}}` is left as written.
 * Returns null when the text needs `{{URL}}` and no origin is configured, so a literal placeholder is never sent.
 */
export function renderPrivacyNoticeText(
  text: string,
  { origin, estateName }: { origin: string | null; estateName: string }
): string | null {
  if (text.includes('{{URL}}') && !origin) return null;
  const values: Record<string, string> = {
    '{{URL}}': origin ?? '',
    '{{App Name}}': estateName,
    '{{App Assistant}}': `${estateName} Assistant`,
  };
  return text.replace(/\{\{(?:URL|App Name|App Assistant)\}\}/g, (token) => values[token]);
}

/**
 * The current notice with placeholders filled, or null when either setting is missing or blank, or the
 * text needs `{{URL}}` and none is configured (callers then use no records). `version` is the raw
 * stored value, so consent stays keyed on it.
 */
export async function loadWhatsAppPrivacyNotice(): Promise<WhatsAppPrivacyNotice | null> {
  const result = await getRawSettingsAsService([PRIVACY_NOTICE_VERSION_KEY, PRIVACY_NOTICE_TEXT_KEY, 'estate_name']);
  if (result.status === 'error') {
    throw new Error(`WhatsApp privacy notice lookup failed: ${result.message}`);
  }
  const version = settingText(result.values.get(PRIVACY_NOTICE_VERSION_KEY));
  const text = settingText(result.values.get(PRIVACY_NOTICE_TEXT_KEY));
  if (!version || !text) return null;
  const rendered = renderPrivacyNoticeText(text, {
    origin: getConfiguredPublicOrigin(),
    estateName: settingText(result.values.get('estate_name')) || 'Residio Estate',
  });
  if (rendered === null) {
    console.error('WhatsApp privacy notice not sent: it contains {{URL}} but NEXT_PUBLIC_SITE_URL is not a valid http(s) URL', { version });
    return null;
  }
  return { version, text: rendered };
}

/** `Contact the estate office on <phone> or <email>.`, or '' when both settings are empty. */
export async function loadEstateOfficeContactLine(): Promise<string> {
  const result = await getRawSettingsAsService(['estate_phone', 'estate_email']);
  if (result.status === 'error') return '';
  const phone = settingText(result.values.get('estate_phone'));
  const email = settingText(result.values.get('estate_email'));
  if (phone && email) return `Contact the estate office on ${phone} or ${email}.`;
  if (phone) return `Contact the estate office on ${phone}.`;
  if (email) return `Contact the estate office at ${email}.`;
  return '';
}
