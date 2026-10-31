import { describe, expect, it, vi } from 'vitest';

/** #871: notice settings read, placeholder rendering and office contact line. */
const settings = vi.hoisted(() => ({ result: { status: 'ok', values: new Map<string, unknown>() } as { status: string; values: Map<string, unknown>; message?: string } }));

vi.mock('@/lib/settings/service', () => ({ getRawSettingsAsService: vi.fn(async () => settings.result) }));

import { loadEstateOfficeContactLine, loadWhatsAppPrivacyNotice, renderPrivacyNoticeText } from '@/lib/whatsapp/privacy-notice';

function withSettings(values: Record<string, unknown>) {
  settings.result = { status: 'ok', values: new Map(Object.entries(values)) };
}

describe('WhatsApp privacy notice', () => {
  it('returns the notice only when both version and text are set', async () => {
    withSettings({ whatsapp_privacy_notice_version: ' v1 ', whatsapp_privacy_notice_text: 'Text' });
    await expect(loadWhatsAppPrivacyNotice()).resolves.toEqual({ version: 'v1', text: 'Text' });

    withSettings({ whatsapp_privacy_notice_version: 'v1', whatsapp_privacy_notice_text: '  ' });
    await expect(loadWhatsAppPrivacyNotice()).resolves.toBeNull();
  });

  it('fails the message rather than treating a lookup error as "no notice"', async () => {
    settings.result = { status: 'error', values: new Map(), message: 'down' };
    await expect(loadWhatsAppPrivacyNotice()).rejects.toThrow('down');
  });

  it.each([
    [{ estate_phone: '0801', estate_email: 'office@estate.test' }, 'Contact the estate office on 0801 or office@estate.test.'],
    [{ estate_phone: '0801' }, 'Contact the estate office on 0801.'],
    [{ estate_email: 'office@estate.test' }, 'Contact the estate office at office@estate.test.'],
    [{}, ''],
  ])('builds the office contact line from %o', async (values, expected) => {
    withSettings(values);
    await expect(loadEstateOfficeContactLine()).resolves.toBe(expected);
  });

  it('fills the placeholders at send time and keeps the stored version', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://estate.test/');
    withSettings({
      whatsapp_privacy_notice_version: 'v1',
      whatsapp_privacy_notice_text: 'Hi from {{App Assistant}}. Read {{URL}}/privacy-policy',
      estate_name: 'Palm Estate',
    });
    await expect(loadWhatsAppPrivacyNotice()).resolves.toEqual({
      version: 'v1',
      text: 'Hi from Palm Estate Assistant. Read https://estate.test/privacy-policy',
    });
    vi.unstubAllEnvs();
  });

  it('fills {{Version}} with the stored version and marks the notice as showing it', async () => {
    withSettings({ whatsapp_privacy_notice_version: ' v2 ', whatsapp_privacy_notice_text: 'Policy (version {{Version}})' });
    await expect(loadWhatsAppPrivacyNotice()).resolves.toEqual({ version: 'v2', text: 'Policy (version v2)', versionInText: true });
  });

  it('uses assistant_name for {{App Assistant}} when set', async () => {
    withSettings({ whatsapp_privacy_notice_version: 'v1', whatsapp_privacy_notice_text: 'Hi from {{App Assistant}}', estate_name: 'Palm Estate', assistant_name: ' Ada ' });
    await expect(loadWhatsAppPrivacyNotice()).resolves.toEqual({ version: 'v1', text: 'Hi from Ada' });
  });

  it('falls back to the default estate name when estate_name is blank', async () => {
    withSettings({ whatsapp_privacy_notice_version: 'v1', whatsapp_privacy_notice_text: '{{App Name}} / {{App Assistant}}', estate_name: '  ' });
    await expect(loadWhatsAppPrivacyNotice()).resolves.toEqual({ version: 'v1', text: 'Residio Estate / Residio Estate Assistant' });
  });

  it('treats the notice as unpublished when {{URL}} has no configured origin', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    withSettings({ whatsapp_privacy_notice_version: 'v1', whatsapp_privacy_notice_text: 'Read {{URL}}' });
    await expect(loadWhatsAppPrivacyNotice()).resolves.toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
    vi.unstubAllEnvs();
  });
});

describe('renderPrivacyNoticeText', () => {
  const ctx = { origin: 'https://estate.test', estateName: 'Palm Estate', assistantName: 'Palm Estate Assistant' };

  it('replaces every exact placeholder and leaves unknown or differently-cased ones', () => {
    expect(renderPrivacyNoticeText('{{App Name}} {{App Name}} {{App Assistant}} {{URL}} {{url}} {{app name}} {{Other}}', ctx)).toBe(
      'Palm Estate Palm Estate Palm Estate Assistant https://estate.test {{url}} {{app name}} {{Other}}'
    );
  });

  it('inserts an estate name containing $& literally', () => {
    expect(renderPrivacyNoticeText('Hi {{App Name}}', { origin: null, estateName: 'A$&B$1', assistantName: 'X' })).toBe('Hi A$&B$1');
  });

  it('returns null for {{URL}} without an origin, but not for text that does not use it', () => {
    expect(renderPrivacyNoticeText('See {{URL}}', { ...ctx, origin: null })).toBeNull();
    expect(renderPrivacyNoticeText('About {{App Name}}', { ...ctx, origin: null })).toBe('About Palm Estate');
  });
});
