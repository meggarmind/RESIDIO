// Regression for #654: the alert parser used to fall back to "now" whenever it could not
// read a date, which lands the payment in the wrong month. Dates here are calendar days,
// so every case runs in a zone east of UTC and in UTC, with the system clock pinned far
// from every expected date so a fallback to "today" cannot pass by coincidence.
process.env.TZ = 'Africa/Lagos';

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseFirstBankAlert } from '@/lib/email-imports/parsers/first-bank-alert';
import { toCalendarDateString } from '@/lib/utils/calendar-date';

const ORIGINAL_TZ = process.env.TZ;
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

const FAKE_NOW = new Date('2031-06-15T12:00:00Z');
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FAKE_NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const ZONES = ['Africa/Lagos', 'UTC'];
const SUBJECT = 'FirstBank Alert on Your Account - Credit';

/** Structured layout from scripts/evaluate-email-parsing.ts; `dateBlock` replaces the date lines. */
const structured = (dateBlock: string) =>
  [
    'Transaction Details',
    dateBlock,
    'Account Number',
    '2021234725',
    'Amount',
    '15,000.00 CR',
    'Narration',
    'FIP:GTB/ANIH LANA/NIP Transfer to OLIVE PARK ESTA',
    'Cleared Balance',
    'NGN7,061,617.47 CR',
  ].join('\n');

const dayOf = (text: string, subject: string | null = SUBJECT) => {
  const parsed = parseFirstBankAlert(text, subject);
  return parsed && parsed.transactionDate ? toCalendarDateString(parsed.transactionDate) : null;
};

describe.each(ZONES)('alert dates in %s', (tz) => {
  beforeEach(() => {
    process.env.TZ = tz;
  });

  describe('(a) bare header lines', () => {
    it('reads the date from the line after a bare Date/Time header', () => {
      expect(dayOf(structured('Date/Time\n09-Sep-2026'))).toBe('2026-09-09');
      expect(dayOf(structured('Date/Time\n09/09/2026'))).toBe('2026-09-09');
    });
    it('reads a bare Date header', () => {
      expect(dayOf(structured('Date\n09-Sep-2026'))).toBe('2026-09-09');
    });
    it('reads a bare-header HTML table', () => {
      const html =
        '<table><tr><td>Date/Time</td></tr><tr><td>12-Jan-26 03:40 PM</td></tr><tr><td>Amount</td></tr><tr><td>15,000.00 CR</td></tr></table>';
      const parsed = parseFirstBankAlert(html, SUBJECT)!;
      expect(toCalendarDateString(parsed.transactionDate!)).toBe('2026-01-12');
      expect(parsed.amount).toBe(15000);
    });
    it('reads the amount, account and narration of a bare-header block', () => {
      const parsed = parseFirstBankAlert(structured('Date/Time\n09-Sep-2026'), SUBJECT)!;
      expect(parsed.amount).toBe(15000);
      expect(parsed.transactionType).toBe('credit');
      expect(parsed.bankAccountLast4).toBe('4725');
      expect(parsed.description).toBe('FIP:GTB/ANIH LANA/NIP Transfer to OLIVE PARK ESTA');
    });
  });

  describe('(b) trailing time', () => {
    it.each([
      ['15-Oct-2026 10:30', '2026-10-15'],
      ['15/10/2026 10:30', '2026-10-15'],
      ['15-10-2026 10:30:45', '2026-10-15'],
      ['2026-10-15 10:30', '2026-10-15'],
      ['15-Oct-2026 03:40 PM', '2026-10-15'],
      ['15-Oct-2026 12:05 am', '2026-10-15'],
      ['12-Jan-26 03:40 PM', '2026-01-12'],
    ])('%s', (value, iso) => {
      expect(dayOf(structured(`Date/Time\n${value}`))).toBe(iso);
      expect(dayOf(structured(`Date/Time: ${value}`))).toBe(iso);
    });
    it('keeps month boundaries on their calendar day', () => {
      expect(dayOf(structured('Date/Time\n31-Oct-2026 23:59'))).toBe('2026-10-31');
      expect(dayOf(structured('Date/Time\n01-Nov-2026 00:01'))).toBe('2026-11-01');
      expect(dayOf(structured('Date/Time\n31/10/2026 11:59 PM'))).toBe('2026-10-31');
      expect(dayOf(structured('Date/Time\n01/11/2026 12:01 AM'))).toBe('2026-11-01');
    });
    it('returns UTC midnight, not the time of day', () => {
      const parsed = parseFirstBankAlert(structured('Date/Time\n15-Oct-2026 23:59'), SUBJECT)!;
      expect(parsed.transactionDate!.toISOString()).toBe('2026-10-15T00:00:00.000Z');
    });
  });

  describe('(c) sender names containing o and n', () => {
    it.each(['JOHN DOE', 'ONYEKA NWOSU', 'Mrs. Ngozi Okon'])('%s', (name) => {
      const parsed = parseFirstBankAlert(
        `account ****1234 has been credited with NGN 50,000.00 by ${name} on 31/10/2026`,
        null
      )!;
      expect(parsed).not.toBeNull();
      expect(parsed.description).toBe(name);
      expect(toCalendarDateString(parsed.transactionDate!)).toBe('2026-10-31');
      expect(parsed.amount).toBe(50000);
      expect(parsed.bankAccountLast4).toBe('1234');
    });
    it('takes the date after the last " on <date>" when the name contains " on "', () => {
      const parsed = parseFirstBankAlert(
        'account ****1234 has been credited with NGN 50,000.00 from DUES on behalf of ADA on 31-Oct-2026 10:30',
        null
      )!;
      expect(parsed.description).toBe('DUES on behalf of ADA');
      expect(toCalendarDateString(parsed.transactionDate!)).toBe('2026-10-31');
    });
  });

  describe('(d) no silent fallback to today', () => {
    it('structured alert with an unreadable date is unparsed, and says why without leaking the body', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(parseFirstBankAlert(structured('Date/Time\nsometime yesterday'), SUBJECT)).toBeNull();
      expect(warn).toHaveBeenCalled();
      const logged = JSON.stringify(warn.mock.calls);
      expect(logged).not.toContain('2021234725');
      expect(logged).not.toContain('OLIVE PARK');
    });
    it('structured alert with an impossible date is unparsed', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(parseFirstBankAlert(structured('Date/Time\n31-Feb-2026'), SUBJECT)).toBeNull();
      expect(parseFirstBankAlert(structured('Date/Time\n45/13/2026'), SUBJECT)).toBeNull();
    });
    it('sentence credit alert without a date is unparsed', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(
        parseFirstBankAlert('Credit Alert: NGN 50,000.00 has been credited to your account ****1234. Ref: TRF/99', null)
      ).toBeNull();
      expect(warn).toHaveBeenCalled();
      expect(JSON.stringify(warn.mock.calls)).not.toContain('1234');
    });
    it('sentence debit alert without a date is unparsed', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(parseFirstBankAlert('NGN 25,000.00 debited from ****5678. Ref: TRF/123456', null)).toBeNull();
    });
    it('a date present in the alert is never replaced by today', () => {
      const today = toCalendarDateString(FAKE_NOW);
      expect(dayOf(structured('Date/Time\n09-Sep-2026 10:30'))).not.toBe(today);
      expect(dayOf('account ****1234 has been credited with NGN 5.00 by JOHN DOE on 01/01/2025', null)).toBe('2025-01-01');
    });
  });

  describe('previously working layouts are unchanged', () => {
    it('same-line "Key: value" layout', () => {
      const text = ['Date: 01-Nov-2026', 'Account Number', '2021234725', 'Amount', '15,000.00 CR', 'Narration', 'dues'].join('\n');
      const parsed = parseFirstBankAlert(text)!;
      expect(toCalendarDateString(parsed.transactionDate!)).toBe('2026-11-01');
      expect(parsed.amount).toBe(15000);
      expect(parsed.description).toBe('dues');
    });
    it('"Key: value" on every line, with a debit suffix', () => {
      const text = ['Date/Time: 12-Jan-26 03:40 PM', 'Account Number: 2021234725', 'Amount: 2,500.50 DR', 'Narration: POS'].join('\n');
      const parsed = parseFirstBankAlert(text)!;
      expect(toCalendarDateString(parsed.transactionDate!)).toBe('2026-01-12');
      expect(parsed.amount).toBe(2500.5);
      expect(parsed.transactionType).toBe('debit');
      expect(parsed.bankAccountLast4).toBe('4725');
    });
    it('HTML layout with same-line values', () => {
      const html = '<div>Date: 12-Jan-26 03:40 PM</div><div>Amount: 15,000.00 CR</div>';
      const parsed = parseFirstBankAlert(html, SUBJECT)!;
      expect(toCalendarDateString(parsed.transactionDate!)).toBe('2026-01-12');
      expect(parsed.amount).toBe(15000);
    });
    it('sentence formats', () => {
      const credit = parseFirstBankAlert('Your account ****1234 has been credited with NGN 50,000.00 by JAKE DEE on 31/10/2026. Ref: TRF/123456789', null)!;
      expect(credit.description).toBe('JAKE DEE');
      expect(credit.reference).toBe('TRF/123456789');
      expect(toCalendarDateString(credit.transactionDate!)).toBe('2026-10-31');
      const debit = parseFirstBankAlert('Debit Alert: NGN 25,000.00 debited from ****5678. Ref: TRF/123456 on 01/01/2025. Avail Bal: NGN 125,000.00', null)!;
      expect(debit.transactionType).toBe('debit');
      expect(debit.amount).toBe(25000);
      expect(toCalendarDateString(debit.transactionDate!)).toBe('2025-01-01');
    });
  });
});

describe('(D1) labels glued to their values, and key word boundaries', () => {
  const minifiedTable =
    '<table><tr><td>Date/Time</td><td>12-Jan-26 03:40 PM</td></tr><tr><td>Account Number</td><td>2021234725</td></tr>' +
    '<tr><td>Amount</td><td>15,000.00 DR</td></tr><tr><td>Narration</td><td>dues</td></tr></table>';

  it('minified HTML table (every cell glued after tag stripping)', () => {
    const parsed = parseFirstBankAlert(minifiedTable, SUBJECT)!;
    expect(parsed).not.toBeNull();
    expect(toCalendarDateString(parsed.transactionDate!)).toBe('2026-01-12');
    expect(parsed.transactionType).toBe('debit');
    expect(parsed.amount).toBe(15000);
    expect(parsed.description).toBe('dues');
  });
  it('glued Date/Time and Amount lines', () => {
    const text = ['Date/Time12-Jan-26 03:40 PM', 'Account Number2021234725', 'Amount15,000.00 CR', 'Narrationdues'].join('\n');
    const parsed = parseFirstBankAlert(text, SUBJECT)!;
    expect(toCalendarDateString(parsed.transactionDate!)).toBe('2026-01-12');
    expect(parsed.amount).toBe(15000);
    expect(parsed.transactionType).toBe('credit');
  });
  it('lowercase keys, colon and label-then-next-line layouts', () => {
    const lower = ['date/time: 12-Jan-26 03:40 PM', 'amount: 15,000.00 CR'].join('\n');
    expect(dayOf(lower)).toBe('2026-01-12');
    expect(dayOf(['date/time', '12-Jan-26 03:40 PM', 'amount', '15,000.00 CR'].join('\n'))).toBe('2026-01-12');
  });
  it('Updated / Validated lines are not the Date key', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const text = ['Updated 2026-01-01', 'Validated', 'Amount', '15,000.00 CR', 'Date/Time', '12-Jan-26 03:40 PM'].join('\n');
    expect(dayOf(text)).toBe('2026-01-12');
    // With no real date line at all, those lines must not supply one.
    expect(dayOf(['Updated 2026-01-01', 'Validated', 'Amount', '15,000.00 CR'].join('\n'))).toBeNull();
  });
});
