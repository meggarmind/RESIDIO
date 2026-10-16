import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { resolveRecipient, toLogRecord, blockedError, isValidOverridePhone } from '@/lib/comms-override/resolver';
import { applyEmailRedirect } from '@/lib/comms-override/apply';
import { getCommsEnvironment } from '@/lib/comms-override/environment';
import { prefixSubject, prefixText, emailBannerHtml } from '@/lib/comms-override/labels';
import type { OverrideSettings, SettingsSnapshot } from '@/lib/comms-override/types';

const OVERRIDE_EMAIL = 'override@example.test';
const OVERRIDE_PHONE = '+15550100100';
const OVERRIDE_WA = '+15550100200';

function snap(over: Partial<OverrideSettings> = {}): SettingsSnapshot {
  return {
    status: 'ok',
    settings: {
      enabled: false,
      email: OVERRIDE_EMAIL,
      phone: OVERRIDE_PHONE,
      whatsappPhone: '',
      debugMode: false,
      debugExpiresAt: null,
      ...over,
    },
  };
}

const PROD = { isProduction: true };
const NON_PROD = { isProduction: false };

type Resident = boolean | null | undefined;

describe('resolveRecipient truth table (#713 decisions 1-5)', () => {
  // [label, env, storedEnabled, debug, residentOverride, expected]
  const rows: Array<[string, typeof PROD, boolean, boolean, Resident, string]> = [
    // Production, switch off: only Debug Mode redirects.
    ['prod, switch off, no resident ctx', PROD, false, false, undefined, 'send'],
    ['prod, switch off, resident null', PROD, false, false, null, 'send'],
    ['prod, switch off, resident true', PROD, false, false, true, 'send'],
    ['prod, switch off, resident false', PROD, false, false, false, 'send'],
    ['prod, switch off, debug, resident false', PROD, false, true, false, 'debug'],
    ['prod, switch off, debug, no resident ctx', PROD, false, true, undefined, 'debug'],
    // Production, switch on.
    ['prod, switch on, no resident ctx', PROD, true, false, undefined, 'global_switch'],
    ['prod, switch on, resident null follows env default (off)', PROD, true, false, null, 'send'],
    ['prod, switch on, resident true', PROD, true, false, true, 'resident_flag'],
    ['prod, switch on, resident false', PROD, true, false, false, 'send'],
    ['prod, switch on, debug beats stored resident false', PROD, true, true, false, 'debug'],
    // Non-production: the stored switch is ignored (forced on).
    ['non-prod, switch off stored, no resident ctx', NON_PROD, false, false, undefined, 'non_production'],
    ['non-prod, switch off stored, resident null', NON_PROD, false, false, null, 'non_production'],
    ['non-prod, switch on, resident null', NON_PROD, true, false, null, 'non_production'],
    ['non-prod, resident true', NON_PROD, false, false, true, 'resident_flag'],
    ['non-prod, explicit resident false sends real', NON_PROD, false, false, false, 'send'],
    ['non-prod, debug beats explicit resident false', NON_PROD, false, true, false, 'debug'],
  ];

  it.each(rows)('%s', (_label, env, enabled, debug, resident, expected) => {
    const result = resolveRecipient(
      { channel: 'email', original: 'real@example.test', residentOverride: resident },
      snap({ enabled, debugMode: debug }),
      env
    );
    if (expected === 'send') {
      expect(result).toEqual({ redirect: false });
    } else {
      expect(result).toEqual({
        redirect: true,
        to: OVERRIDE_EMAIL,
        original: 'real@example.test',
        reason: expected,
      });
    }
  });

  it('picks the override value per channel, with WhatsApp preferring its own number', () => {
    const settings = snap({ whatsappPhone: OVERRIDE_WA });
    const at = (channel: 'email' | 'sms' | 'whatsapp') =>
      resolveRecipient({ channel, original: 'x' }, settings, NON_PROD);
    expect(at('email')).toMatchObject({ redirect: true, to: OVERRIDE_EMAIL });
    expect(at('sms')).toMatchObject({ redirect: true, to: OVERRIDE_PHONE });
    expect(at('whatsapp')).toMatchObject({ redirect: true, to: OVERRIDE_WA });
  });

  it('falls back to the override phone for WhatsApp when no WhatsApp number is set', () => {
    expect(
      resolveRecipient({ channel: 'whatsapp', original: 'x' }, snap({ whatsappPhone: '' }), NON_PROD)
    ).toMatchObject({ redirect: true, to: OVERRIDE_PHONE });
  });
});

describe('Debug Mode expiry', () => {
  const now = new Date('2026-10-17T12:00:00Z');
  const send = (over: Partial<OverrideSettings>) =>
    resolveRecipient({ channel: 'email', original: 'a@example.test', residentOverride: false }, snap(over), PROD, now);

  it('redirects while the expiry is in the future', () => {
    expect(send({ debugMode: true, debugExpiresAt: '2026-10-17T13:00:00Z' })).toMatchObject({ redirect: true, reason: 'debug' });
  });

  it('is off once the expiry is in the past', () => {
    expect(send({ debugMode: true, debugExpiresAt: '2026-10-17T11:00:00Z' })).toEqual({ redirect: false });
  });

  it('keeps the redirect on for an unparseable expiry (fail closed)', () => {
    expect(send({ debugMode: true, debugExpiresAt: 'not-a-date' })).toMatchObject({ redirect: true, reason: 'debug' });
  });
});

describe('fail closed', () => {
  it('blocks a redirect when the override email is blank, never sending to the original', () => {
    const result = resolveRecipient({ channel: 'email', original: 'real@example.test' }, snap({ email: '' }), NON_PROD);
    expect(result).toMatchObject({ blocked: true, code: 'override_missing', original: 'real@example.test' });
    expect('redirect' in result).toBe(false);
  });

  it('blocks an invalid override email', () => {
    expect(resolveRecipient({ channel: 'email', original: 'x' }, snap({ email: 'not-an-email' }), NON_PROD)).toMatchObject({ blocked: true });
  });

  it('blocks SMS when the override phone is blank or not E.164', () => {
    expect(resolveRecipient({ channel: 'sms', original: 'x' }, snap({ phone: '' }), NON_PROD)).toMatchObject({ blocked: true });
    expect(resolveRecipient({ channel: 'sms', original: 'x' }, snap({ phone: '08012345678' }), NON_PROD)).toMatchObject({ blocked: true });
  });

  it('blocks WhatsApp when both numbers are blank', () => {
    expect(
      resolveRecipient({ channel: 'whatsapp', original: 'x' }, snap({ phone: '', whatsappPhone: '' }), NON_PROD)
    ).toMatchObject({ blocked: true, code: 'override_missing' });
  });

  it('blocks in production Debug Mode with a blank override', () => {
    expect(
      resolveRecipient({ channel: 'email', original: 'x' }, snap({ debugMode: true, email: '' }), PROD)
    ).toMatchObject({ blocked: true });
  });

  it('does not need an override value when no redirect applies', () => {
    expect(resolveRecipient({ channel: 'email', original: 'x' }, snap({ email: '' }), PROD)).toEqual({ redirect: false });
  });

  it('blocks when the settings could not be read', () => {
    const result = resolveRecipient(
      { channel: 'email', original: 'real@example.test' },
      { status: 'error', message: 'boom' },
      PROD
    );
    expect(result).toMatchObject({ blocked: true, code: 'settings_unreadable' });
  });

  it('blocks an unknown channel', () => {
    const result = resolveRecipient(
      { channel: 'pigeon' as unknown as 'email', original: 'x' },
      snap(),
      NON_PROD
    );
    expect(result).toMatchObject({ blocked: true, code: 'unknown_channel' });
  });

  it('formats the blocked error as the issue specifies', () => {
    const result = resolveRecipient({ channel: 'email', original: 'x' }, snap({ email: '' }), NON_PROD);
    if (!('blocked' in result)) throw new Error('expected blocked');
    expect(blockedError(result)).toBe('comms override blocked: override email is blank or invalid');
  });
});

describe('2FA exemption', () => {
  it('never redirects purpose self_auth_2fa, even in non-production with a working override', () => {
    expect(
      resolveRecipient({ channel: 'email', original: 'me@example.test', purpose: 'self_auth_2fa' }, snap(), NON_PROD)
    ).toEqual({ redirect: false });
  });

  it('never redirects it in Debug Mode', () => {
    expect(
      resolveRecipient({ channel: 'sms', original: '+15550100999', purpose: 'self_auth_2fa' }, snap({ debugMode: true }), PROD)
    ).toEqual({ redirect: false });
  });

  it('is not blocked by unreadable settings', () => {
    expect(
      resolveRecipient({ channel: 'sms', original: 'x', purpose: 'self_auth_2fa' }, { status: 'error', message: 'down' }, NON_PROD)
    ).toEqual({ redirect: false });
  });
});

describe('inbound_reply exemption (decision 8)', () => {
  const channels = ['email', 'sms', 'whatsapp'] as const;

  it.each([
    ['non-production', NON_PROD],
    ['production', PROD],
  ])('is never redirected or blocked in %s, even with blank overrides, debug on and unreadable settings', (_name, env) => {
    const blank = snap({ email: '', phone: '', whatsappPhone: '', debugMode: true, enabled: true });
    const unreadable: SettingsSnapshot = { status: 'error', message: 'db down' };
    for (const channel of channels) {
      for (const snapshot of [snap(), blank, unreadable]) {
        expect(
          resolveRecipient({ channel, original: '2348000000000', purpose: 'inbound_reply', residentOverride: true }, snapshot, env)
        ).toEqual({ redirect: false });
      }
    }
  });

  it('does not exempt an ordinary send with the same input', () => {
    expect(resolveRecipient({ channel: 'whatsapp', original: '2348000000000' }, snap(), NON_PROD)).toMatchObject({ redirect: true });
  });
});

describe('toLogRecord', () => {
  it('records original and actual for a redirect', () => {
    const result = resolveRecipient({ channel: 'email', original: 'real@example.test' }, snap(), NON_PROD);
    expect(toLogRecord(result)).toEqual({ original: 'real@example.test', actual: OVERRIDE_EMAIL, reason: 'non_production' });
  });

  it('records a block with a null actual', () => {
    const result = resolveRecipient({ channel: 'email', original: 'real@example.test' }, snap({ email: '' }), NON_PROD);
    expect(toLogRecord(result)).toMatchObject({ original: 'real@example.test', actual: null, blocked: true });
  });

  it('records nothing when the message is sent unaltered', () => {
    expect(toLogRecord({ redirect: false })).toBeNull();
  });
});

describe('getCommsEnvironment', () => {
  it('treats production and prod as production', () => {
    expect(getCommsEnvironment('production').isProduction).toBe(true);
    expect(getCommsEnvironment(' PROD ').isProduction).toBe(true);
  });

  it('treats unset, unknown, staging and development as non-production', () => {
    for (const raw of [undefined, '', 'banana', 'staging', 'stage', 'development']) {
      expect(getCommsEnvironment(raw).isProduction, String(raw)).toBe(false);
    }
  });

  it('labels the environments', () => {
    expect(getCommsEnvironment('stage').label).toBe('STAGE');
    expect(getCommsEnvironment(undefined).label).toBe('DEV');
  });
});

describe('labels', () => {
  it('prefixes the subject with the environment and original', () => {
    expect(prefixSubject('STAGE', 'real@example.test', 'Invoice')).toBe('[STAGE → real@example.test] Invoice');
  });

  it('prefixes SMS and WhatsApp text with the environment and original phone', () => {
    expect(prefixText('STAGE', '+15550100999', 'Pay now')).toBe('[STAGE → +15550100999] Pay now');
  });

  it('escapes the original in the html banner', () => {
    expect(emailBannerHtml('STAGE', '<b>x</b>@example.test')).not.toContain('<b>');
  });
});

describe('applyEmailRedirect', () => {
  const attachments = [{ filename: 'report.pdf', content: Buffer.from('pdf') }];
  const redirect = { to: OVERRIDE_EMAIL, original: 'a@example.test, b@example.test' };

  it('replaces to with the single override, labels the subject and keeps attachments', () => {
    const out = applyEmailRedirect(
      { to: ['a@example.test', 'b@example.test'], subject: 'Report', attachments, html: '<p>Hi</p>', text: 'Hi' },
      redirect,
      'STAGE'
    );
    expect(out.to).toBe(OVERRIDE_EMAIL);
    expect(out.subject).toBe('[STAGE → a@example.test, b@example.test] Report');
    expect(out.attachments).toBe(attachments);
    expect(out.html).toMatch(/^<div[^>]*>[\s\S]*STAGE environment[\s\S]*<\/div><p>Hi<\/p>$/);
    expect(out.text).toMatch(/^STAGE environment: .*a@example\.test, b@example\.test\.\n\nHi$/);
  });

  it('drops cc and bcc', () => {
    const out = applyEmailRedirect(
      { to: 'a@example.test', subject: 'S', cc: ['cc@example.test'], bcc: 'bcc@example.test' } as never,
      redirect,
      'STAGE'
    ) as Record<string, unknown>;
    expect('cc' in out).toBe(false);
    expect('bcc' in out).toBe(false);
  });

  it('wraps a react body with a banner and leaves absent bodies absent', () => {
    const body = createElement('p', null, 'Hello');
    const withReact = applyEmailRedirect({ to: 'a@example.test', subject: 'S', react: body }, redirect, 'STAGE');
    expect(withReact.react).not.toBe(body);
    const plain = applyEmailRedirect({ to: 'a@example.test', subject: 'S' }, redirect, 'STAGE');
    expect('html' in plain).toBe(false);
    expect('react' in plain).toBe(false);
  });
});

describe('isValidOverridePhone', () => {
  it('accepts E.164 and rejects local formats', () => {
    expect(isValidOverridePhone('+2348012345678')).toBe(true);
    expect(isValidOverridePhone('08012345678')).toBe(false);
    expect(isValidOverridePhone('')).toBe(false);
  });
});
