import { describe, expect, it } from 'vitest';
import { generateHouseShortName, houseFormSchema } from '@/lib/validators/house';

// The invoice-run preflight pattern, applied after upper(btrim()).
const invoiceRunPattern = /^[A-Z0-9][A-Z0-9.-]*$/;

const base = {
  house_number: '14',
  street_id: '11111111-1111-4111-8111-111111111111',
  number_of_plots: 1,
};

const check = (short_name: string) => houseFormSchema.safeParse({ ...base, short_name });

describe('houseFormSchema short_name (#965)', () => {
  it.each(['GLB-14', 'OJO.K-24', 'glb-14f-3', 'A', '9B'])('accepts %s', (value) => {
    expect(check(value).success).toBe(true);
  });

  it('accepts an empty string (generated server-side)', () => {
    expect(check('').success).toBe(true);
  });

  it.each([
    ['a space', 'GLB-14 F1'],
    ['a question mark', 'IBB-3?F?'],
    ['a leading hyphen', '-GLB-14'],
    ['a leading dot', '.GLB-14'],
  ])('rejects %s', (_label, value) => {
    const result = check(value);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Use letters, digits, dots and hyphens only');
    }
  });

  it('agrees with the invoice-run pattern on every accepted value', () => {
    for (const value of ['GLB-14', 'OJO.K-24', 'glb-14f-3']) {
      expect(invoiceRunPattern.test(value.trim().toUpperCase())).toBe(true);
    }
  });
});

describe('generateHouseShortName (#965)', () => {
  it('turns a space into a hyphen: 14 F1 -> GLB-14-F1', () => {
    expect(generateHouseShortName('glb', '14 F1')).toBe('GLB-14-F1');
  });

  it('collapses a whitespace run and trims the ends', () => {
    expect(generateHouseShortName('OJO.K', ' 24  \t BLK1 ')).toBe('OJO.K-24-BLK1');
  });

  it('leaves a number without whitespace unchanged', () => {
    expect(generateHouseShortName('GLB', '14f-3')).toBe('GLB-14F-3');
  });

  it('returns an empty string without a street code or number', () => {
    expect(generateHouseShortName(null, '14')).toBe('');
    expect(generateHouseShortName('GLB', '')).toBe('');
  });

  it('produces a value the form accepts', () => {
    expect(check(generateHouseShortName('GLB', '14 F1')).success).toBe(true);
  });
});
