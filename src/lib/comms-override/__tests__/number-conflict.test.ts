import { describe, expect, it } from 'vitest';
import {
  effectiveOverrideWhatsAppTarget,
  fromNumberConflict,
  overrideNumberConflict,
  samePhone,
} from '@/lib/comms-override/number-conflict';

const FROM = '+2348037000101';

describe('samePhone', () => {
  it('matches after normalising formatting and local prefix', () => {
    expect(samePhone('+2348037000101', '08037000101')).toBe(true);
    expect(samePhone('+234 803 700 0101', '+2348037000101')).toBe(true);
  });
  it('is never a match when either side is blank or unset', () => {
    expect(samePhone('', '')).toBe(false);
    expect(samePhone(FROM, '')).toBe(false);
    expect(samePhone(null, FROM)).toBe(false);
    expect(samePhone(FROM, undefined)).toBe(false);
  });
  it('does not match different numbers', () => {
    expect(samePhone(FROM, '+2348037000102')).toBe(false);
  });
});

describe('effectiveOverrideWhatsAppTarget', () => {
  it('prefers the WhatsApp override and falls back to the override phone when it is blank', () => {
    expect(effectiveOverrideWhatsAppTarget({ phone: '+1', whatsappPhone: '+2' })).toEqual({ field: 'whatsappPhone', value: '+2' });
    expect(effectiveOverrideWhatsAppTarget({ phone: '+1', whatsappPhone: '  ' })).toEqual({ field: 'phone', value: '+1' });
  });
});

describe('fromNumberConflict', () => {
  it('names the WhatsApp override number when that is the target', () => {
    expect(fromNumberConflict(FROM, { phone: '+15550100100', whatsappPhone: FROM })).toContain('same as the WhatsApp number');
  });
  it('names the override phone when the WhatsApp number is blank', () => {
    expect(fromNumberConflict(FROM, { phone: FROM, whatsappPhone: '' })).toContain('same as the override phone');
  });
  it('ignores the override phone when a different WhatsApp number is set', () => {
    expect(fromNumberConflict(FROM, { phone: FROM, whatsappPhone: '+15550100200' })).toBeNull();
  });
  it('is no conflict when the from-number or both overrides are blank', () => {
    expect(fromNumberConflict('', { phone: FROM, whatsappPhone: FROM })).toBeNull();
    expect(fromNumberConflict(FROM, { phone: '', whatsappPhone: '' })).toBeNull();
  });
});

describe('overrideNumberConflict', () => {
  it('flags the WhatsApp number field', () => {
    expect(overrideNumberConflict({ phone: '+15550100100', whatsappPhone: FROM }, FROM)?.field).toBe('whatsappPhone');
  });
  it('flags the phone field only through the blank-WhatsApp fallback', () => {
    expect(overrideNumberConflict({ phone: FROM, whatsappPhone: '' }, FROM)?.field).toBe('phone');
    expect(overrideNumberConflict({ phone: FROM, whatsappPhone: '+15550100200' }, FROM)).toBeNull();
  });
  it('is no conflict with a blank or missing from-number', () => {
    expect(overrideNumberConflict({ phone: FROM, whatsappPhone: FROM }, '')).toBeNull();
    expect(overrideNumberConflict({ phone: FROM, whatsappPhone: FROM }, null)).toBeNull();
  });
});
