import { getRawSettingsAsService } from '@/lib/settings/service';
import { DEFAULT_ESTATE_NAME, formatNotice, type NoticeKind } from '@/lib/whatsapp/notice-format';

/** The estate name for the footer. Never throws: a failed read falls back to a generic name. */
export async function loadNoticeEstateName(): Promise<string> {
  try {
    const settings = await getRawSettingsAsService(['estate_name']);
    const value = settings.status === 'ok' ? settings.values.get('estate_name') : null;
    return typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_ESTATE_NAME;
  } catch {
    return DEFAULT_ESTATE_NAME;
  }
}

/** `formatNotice` with the estate name read from settings. */
export async function buildNotice(kind: NoticeKind, body: string): Promise<string> {
  return formatNotice(kind, body, await loadNoticeEstateName());
}
