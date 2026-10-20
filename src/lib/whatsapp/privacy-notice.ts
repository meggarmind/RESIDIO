import { createHash } from 'node:crypto';
import { renderToBuffer } from '@react-pdf/renderer';
import { PrivacyNoticePDF } from '@/lib/pdf/privacy-notice';
import { getRawSettingsAsService } from '@/lib/settings/service';
import { createAdminClient } from '@/lib/supabase/server';

export const PRIVACY_NOTICE_VERSION_KEY = 'whatsapp_privacy_notice_version';
export const PRIVACY_NOTICE_TEXT_KEY = 'whatsapp_privacy_notice_text';

const MEDIA_BUCKET = 'whatsapp-media';
const SIGNED_URL_SECONDS = 60 * 60;

export interface WhatsAppPrivacyNotice {
  version: string;
  text: string;
}

function settingText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** The current notice, or null when either setting is missing or blank (callers then use no records). */
export async function loadWhatsAppPrivacyNotice(): Promise<WhatsAppPrivacyNotice | null> {
  const result = await getRawSettingsAsService([PRIVACY_NOTICE_VERSION_KEY, PRIVACY_NOTICE_TEXT_KEY]);
  if (result.status === 'error') {
    throw new Error(`WhatsApp privacy notice lookup failed: ${result.message}`);
  }
  const version = settingText(result.values.get(PRIVACY_NOTICE_VERSION_KEY));
  const text = settingText(result.values.get(PRIVACY_NOTICE_TEXT_KEY));
  return version && text ? { version, text } : null;
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

/**
 * A 1-hour signed URL for the notice PDF in private storage. The file is keyed on a hash of the
 * version and text, so it is rendered once per wording; the text cannot change without a new
 * version, so each accepted version covers one wording.
 */
export async function createWhatsAppPrivacyNoticeUrl(notice: WhatsAppPrivacyNotice): Promise<string> {
  const storage = createAdminClient().storage.from(MEDIA_BUCKET);
  const hash = createHash('sha256').update(`${notice.version}\n${notice.text}`).digest('hex').slice(0, 32);
  const path = `privacy-notice/${hash}.pdf`;

  const existing = await storage.createSignedUrl(path, SIGNED_URL_SECONDS);
  if (existing.data?.signedUrl) return existing.data.signedUrl;

  const settings = await getRawSettingsAsService(['estate_name']);
  const estateName = (settings.status === 'ok' && settingText(settings.values.get('estate_name'))) || 'Residio Estate';
  const pdf = await renderToBuffer(PrivacyNoticePDF({ estateName, version: notice.version, text: notice.text }));
  const upload = await storage.upload(path, new Uint8Array(pdf), { contentType: 'application/pdf', upsert: true });
  if (upload.error) throw new Error(`WhatsApp privacy notice upload failed: ${upload.error.message}`);

  const signed = await storage.createSignedUrl(path, SIGNED_URL_SECONDS);
  if (!signed.data?.signedUrl) throw new Error('WhatsApp privacy notice signed URL failed');
  return signed.data.signedUrl;
}
