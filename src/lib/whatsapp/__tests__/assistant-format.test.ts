import { describe, expect, it } from 'vitest';
import {
  contactLine,
  describeOfficeHours,
  formatClock,
  formatDay,
  formatNaira,
  maskReference,
  officeBackLine,
  parseKeywordSynonyms,
  parseOfficeHours,
  type OfficeHours,
} from '@/lib/whatsapp/assistant-format';

// The owner's launch value (#804 amendment 3): weekdays 5pm to 10pm, weekends all day.
const LAUNCH: OfficeHours = [
  { mode: 'all_day' },
  ...Array.from({ length: 5 }, () => ({ mode: 'hours' as const, from: '17:00', to: '22:00' })),
  { mode: 'all_day' },
];

describe('WhatsApp Assistant formatting (#804)', () => {
  it('formats amounts in naira with 2 decimals and signs credit', () => {
    expect(formatNaira(125000)).toBe('₦125,000.00');
    expect(formatNaira(-50)).toBe('−₦50.00');
  });

  it('formats calendar days as is and instants on their Lagos day', () => {
    expect(formatDay('2026-08-01')).toBe('1 Aug 2026');
    expect(formatDay('2026-09-12')).toBe('12 Sep 2026');
    // 23:30 UTC is 00:30 the next day in Lagos.
    expect(formatDay('2026-10-19T23:30:00Z')).toBe('20 Oct 2026');
    expect(formatDay('2026-10-19T22:30:00Z')).toBe('19 Oct 2026');
  });

  it('masks a payment reference to its last 4 characters', () => {
    expect(maskReference('FT26101234A7F2')).toBe('ref ••••A7F2');
    expect(maskReference('  ')).toBeNull();
    expect(maskReference(null)).toBeNull();
  });

  it('reads 12-hour clock times', () => {
    expect(formatClock('17:00')).toBe('5pm');
    expect(formatClock('09:30')).toBe('9:30am');
    expect(formatClock('00:00')).toBe('12am');
    expect(formatClock('12:00')).toBe('12pm');
  });
});

describe('Estate office hours and contact line (#804 amendments 2-4)', () => {
  it('describes the launch hours in one phrase', () => {
    expect(describeOfficeHours(LAUNCH)).toBe('weekdays 5pm to 10pm and all day at weekends');
  });

  it('describes other runs and leaves closed days out', () => {
    const hours: OfficeHours = [
      { mode: 'closed' },
      { mode: 'hours', from: '09:00', to: '17:00' },
      { mode: 'hours', from: '09:00', to: '17:00' },
      { mode: 'hours', from: '09:00', to: '17:00' },
      { mode: 'closed' },
      { mode: 'hours', from: '10:00', to: '14:00' },
      { mode: 'closed' },
    ];
    expect(describeOfficeHours(hours)).toBe('Mon to Wed 9am to 5pm and Fridays 10am to 2pm');
    expect(describeOfficeHours(Array.from({ length: 7 }, () => ({ mode: 'all_day' as const })))).toBe('all day every day');
  });

  it('renders the owner example contact line', () => {
    // Monday 18:00 Lagos: open, so no "back at" line.
    const now = new Date('2026-10-19T17:00:00Z');
    expect(contactLine({ phone: '0803 699 6725', email: 'opera4street@gmail.com', hours: LAUNCH }, now)).toBe(
      'Contact the estate office on 0803 699 6725 or opera4street@gmail.com, weekdays 5pm to 10pm and all day at weekends.'
    );
  });

  it('omits the line when phone and email are both empty, and the hours when unset', () => {
    expect(contactLine({ phone: null, email: null, hours: LAUNCH }, new Date())).toBeNull();
    expect(contactLine({ phone: '0803', email: null, hours: null }, new Date())).toBe('Contact the estate office on 0803.');
  });

  it('says when the office is back outside hours', () => {
    // Monday 10:00 Lagos.
    expect(officeBackLine(LAUNCH, new Date('2026-10-19T09:00:00Z'))).toBe('The office is back at 5pm today.');
    // Monday 23:00 Lagos.
    expect(officeBackLine(LAUNCH, new Date('2026-10-19T22:00:00Z'))).toBe('The office is back at 5pm tomorrow.');
    // Friday 23:00 Lagos: Saturday is all day.
    expect(officeBackLine(LAUNCH, new Date('2026-10-23T22:00:00Z'))).toBe('The office is back tomorrow.');
    // Saturday: open all day.
    expect(officeBackLine(LAUNCH, new Date('2026-10-24T09:00:00Z'))).toBeNull();
    expect(contactLine({ phone: '0803', email: null, hours: LAUNCH }, new Date('2026-10-19T09:00:00Z'))).toBe(
      'Contact the estate office on 0803, weekdays 5pm to 10pm and all day at weekends. The office is back at 5pm today.'
    );
  });

  it('reads the stored setting as JSON and rejects malformed or all-closed values', () => {
    expect(parseOfficeHours(JSON.stringify(LAUNCH))).toEqual(LAUNCH);
    expect(parseOfficeHours(LAUNCH)).toEqual(LAUNCH);
    expect(parseOfficeHours('')).toBeNull();
    expect(parseOfficeHours('not json')).toBeNull();
    expect(parseOfficeHours(LAUNCH.slice(1))).toBeNull();
    expect(parseOfficeHours(LAUNCH.map((day, index) => (index === 1 ? { mode: 'hours', from: '22:00', to: '17:00' } : day)))).toBeNull();
    expect(parseOfficeHours(Array.from({ length: 7 }, () => ({ mode: 'closed' })))).toBeNull();
  });
});

describe('Assistant keyword synonyms setting', () => {
  it('reads one phrase = item per line and skips bad lines', () => {
    expect(parseKeywordSynonyms('Service charge = owe\ndues=OWE\nnonsense\nfoo = bar\n = owe')).toEqual({
      'service charge': 'owe',
      dues: 'owe',
    });
    expect(parseKeywordSynonyms(null)).toEqual({});
  });
});
