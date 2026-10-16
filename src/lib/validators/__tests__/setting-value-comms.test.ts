import { describe, expect, it } from 'vitest';
import { settingValueError } from '@/lib/validators/setting-value';

const NOW = new Date('2026-10-17T12:00:00.000Z');
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();
const check = (key: string, value: unknown) => settingValueError(key, value, NOW);

describe('comms_debug_expires_at', () => {
  it('accepts a blank value (cleared)', () => {
    expect(check('comms_debug_expires_at', '')).toBeNull();
  });

  it('accepts an expiry in the past', () => {
    expect(check('comms_debug_expires_at', at(-10))).toBeNull();
  });

  it('accepts the longest duration plus the clock slack (just inside)', () => {
    expect(check('comms_debug_expires_at', at(480 + 5))).toBeNull();
  });

  it('rejects one second beyond that (just outside)', () => {
    expect(check('comms_debug_expires_at', new Date(NOW.getTime() + (485 * 60 + 1) * 1000).toISOString())).toMatch(/cannot be more than 480 minutes/);
  });

  it.each(['9999-12-31T00:00:00Z', at(60 * 24 * 365)])('rejects a far-future expiry %s', (value) => {
    expect(check('comms_debug_expires_at', value)).not.toBeNull();
  });

  it.each(['never', 'tomorrow-ish', 'garbage'])('rejects an unparseable expiry %s', (value) => {
    expect(check('comms_debug_expires_at', value)).toMatch(/ISO timestamp/);
  });

  it('rejects a non-string expiry', () => {
    expect(check('comms_debug_expires_at', 4102444800000)).not.toBeNull();
  });
});

describe('comms_debug_duration_minutes', () => {
  it.each([5, 60, 480, '90'])('accepts %s', (value) => {
    expect(check('comms_debug_duration_minutes', value)).toBeNull();
  });

  it.each([4, 481, 12.5, 'abc', '', null, 10000])('rejects %s', (value) => {
    expect(check('comms_debug_duration_minutes', value)).not.toBeNull();
  });
});

describe('comms switches', () => {
  it.each(['comms_debug_mode', 'comms_override_enabled'])('%s accepts booleans and their string forms', (key) => {
    for (const v of [true, false, 'true', 'false']) expect(check(key, v)).toBeNull();
  });

  it.each(['comms_debug_mode', 'comms_override_enabled'])('%s rejects anything else', (key) => {
    for (const v of ['yes', 1, '', null]) expect(check(key, v)).not.toBeNull();
  });
});

describe('override contacts', () => {
  it('accepts blank or valid values', () => {
    expect(check('comms_override_email', '')).toBeNull();
    expect(check('comms_override_email', 'override@example.test')).toBeNull();
    expect(check('comms_override_phone', '+15550100100')).toBeNull();
    expect(check('comms_override_whatsapp_phone', '')).toBeNull();
    expect(check('comms_override_whatsapp_phone', '+15550100200')).toBeNull();
  });

  it('rejects an invalid email', () => {
    expect(check('comms_override_email', 'not-an-email')).not.toBeNull();
    expect(check('comms_override_email', 'a@b.test, c@d.test')).not.toBeNull();
  });

  it.each(['comms_override_phone', 'comms_override_whatsapp_phone'])('%s rejects a non-E.164 value or a number', (key) => {
    expect(check(key, '08012345678')).not.toBeNull();
    expect(check(key, 8012345678)).not.toBeNull();
  });
});

describe('other keys', () => {
  it('leave the existing rules alone', () => {
    expect(check('invoice_due_days', 30)).toBeNull();
    expect(check('invoice_due_days', 99999)).not.toBeNull();
  });
});
