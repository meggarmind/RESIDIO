// Regression for #648: statement dates are calendar days. They must survive the
// browser parse -> review display -> period_start/period_end -> createImportRows
// payload path unchanged in every time zone. TZ is set inside the file so the
// result does not depend on the machine running it (CI is UTC; the bug needs a
// non-UTC zone).
process.env.TZ = 'Africa/Lagos';

import { afterAll, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseCSVString } from '@/lib/parsers/csv-parser';
import { parseXLSXBuffer, parseExcelDate } from '@/lib/parsers/xlsx-parser';
import { parseFirstBankDate } from '@/lib/parsers/bank-formats/firstbank';
import { parseFirstBankAlert } from '@/lib/email-imports/parsers/first-bank-alert';
import { formatCalendarDate, toCalendarDateString } from '@/lib/utils/calendar-date';

const ORIGINAL_TZ = process.env.TZ;
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

const TIME_ZONES = ['Africa/Lagos', 'America/New_York', 'UTC', 'Pacific/Auckland'];
const MAP = { date: 'Date', description: 'Narration', credit: 'Credit', debit: 'Debit', reference: '' };

// [DD/MM/YYYY as written in the statement, expected YYYY-MM-DD, expected "DD Mon"]
const CASES: Array<[string, string, string]> = [
  ['15/10/2026', '2026-10-15', '15 Oct'],
  ['01/11/2026', '2026-11-01', '01 Nov'], // first of month stays in November
  ['31/10/2026', '2026-10-31', '31 Oct'], // last of month stays in October
  ['29/02/2028', '2028-02-29', '29 Feb'], // leap day
  ['01/01/2027', '2027-01-01', '01 Jan'], // year boundary
];

// What createImportRows stores (src/actions/imports/create-import.ts) and what the
// review step shows once that value is read back from the database.
const storedDate = (d: Date) => d.toISOString().split('T')[0];
const reviewDisplay = (stored: string) => formatCalendarDate(stored, 'en-GB', { day: '2-digit', month: 'short' });

const serial = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000;
};

function xlsxBuffer(cell: XLSX.CellObject | string): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Date', 'Narration', 'Credit', 'Debit'],
    [cell, 'Dues', 5000, ''],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'S');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

describe.each(TIME_ZONES)('statement dates in %s (#648)', (tz) => {
  const setZone = () => {
    process.env.TZ = tz;
  };

  it.each(CASES)('CSV %s', async (written, iso, shown) => {
    setZone();
    const result = await parseCSVString(`Date,Narration,Credit,Debit\n${written},Dues,5000,\n`, {
      bankFormat: 'firstbank',
      columnMapping: MAP,
    });
    const date = result.rows[0].transaction_date as Date;

    expect(toCalendarDateString(date)).toBe(iso); // period_start / period_end
    expect(storedDate(date)).toBe(iso); // createImportRows payload
    expect(reviewDisplay(storedDate(date))).toBe(shown); // review table
    expect(toCalendarDateString(result.dateRange.start as Date)).toBe(iso);
    expect(toCalendarDateString(result.dateRange.end as Date)).toBe(iso);
    expect(formatCalendarDate(date, 'en-GB')).toBe(written); // column-mapper preview
  });

  it.each(CASES)('XLSX numeric date cell %s', async (written, iso, shown) => {
    setZone();
    const buffer = xlsxBuffer({ t: 'n', v: serial(iso), z: 'dd/mm/yyyy' });
    const result = await parseXLSXBuffer(buffer, { bankFormat: 'firstbank', columnMapping: MAP });
    const date = result.rows[0].transaction_date as Date;

    expect(storedDate(date)).toBe(iso);
    expect(toCalendarDateString(result.dateRange.start as Date)).toBe(iso);
    expect(reviewDisplay(storedDate(date))).toBe(shown);
  });

  it.each(CASES)('XLSX ISO text cell with no bank parser %s', async (_written, iso) => {
    setZone();
    const buffer = xlsxBuffer(iso);
    const result = await parseXLSXBuffer(buffer, { bankFormat: 'none', columnMapping: MAP });
    expect(storedDate(result.rows[0].transaction_date as Date)).toBe(iso);
  });

  it.each(CASES)('Excel serial number %s', (_written, iso) => {
    setZone();
    expect(toCalendarDateString(parseExcelDate(serial(iso)) as Date)).toBe(iso);
    // Time-of-day fraction does not move the day.
    expect(toCalendarDateString(parseExcelDate(serial(iso) + 0.75) as Date)).toBe(iso);
  });

  it.each(CASES)('FirstBank formats %s', (written, iso) => {
    setZone();
    const [dd, mm, yyyy] = written.split('/');
    const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(mm) - 1];
    for (const text of [written, `${dd}-${mm}-${yyyy}`, `${dd}-${month}-${yyyy}`, iso, `${yyyy}/${mm}/${dd}`]) {
      expect(storedDate(parseFirstBankDate(text) as Date)).toBe(iso);
    }
  });

  it('FirstBank fallback (native-parsed text) keeps the local calendar day', () => {
    setZone();
    expect(storedDate(parseFirstBankDate('October 15, 2026') as Date)).toBe('2026-10-15');
  });

  it('period_start / period_end across a month boundary', async () => {
    setZone();
    const csv = 'Date,Narration,Credit,Debit\n31/10/2026,A,1,\n01/11/2026,B,1,\n15/10/2026,C,1,\n';
    const result = await parseCSVString(csv, { bankFormat: 'firstbank', columnMapping: MAP });
    const sorted = result.rows
      .map((r) => r.transaction_date as Date)
      .sort((a, b) => a.getTime() - b.getTime()); // same sort import-preview.tsx uses
    expect(toCalendarDateString(sorted[0])).toBe('2026-10-15');
    expect(toCalendarDateString(sorted[sorted.length - 1])).toBe('2026-11-01');
  });

  it('email alert parser dates (structured and sentence formats)', () => {
    setZone();
    const alert = (dateTime: string) =>
      ['Date: ' + dateTime, 'Account Number', '2021234725', 'Amount', '15,000.00 CR', 'Narration', 'dues'].join('\n');
    const structured = parseFirstBankAlert(alert('01-Nov-2026'));
    expect(storedDate(structured!.transactionDate as Date)).toBe('2026-11-01');
    const twoDigit = parseFirstBankAlert(alert('12-Jan-26 03:40 PM'));
    expect(storedDate(twoDigit!.transactionDate as Date)).toBe('2026-01-12');
    const sentence = parseFirstBankAlert('account ****1234 has been credited with NGN 50,000.00 by JAKE DEE on 31/10/2026');
    expect(storedDate(sentence!.transactionDate as Date)).toBe('2026-10-31');
  });
});

describe('formatCalendarDate', () => {
  it.each(TIME_ZONES)('does not re-interpret a stored date in %s', (tz) => {
    process.env.TZ = tz;
    expect(formatCalendarDate('2026-10-15', 'en-GB')).toBe('15/10/2026');
    expect(formatCalendarDate('2026-11-01', 'en-GB', { day: '2-digit', month: 'short' })).toBe('01 Nov');
    expect(formatCalendarDate('not a date')).toBe('');
  });
});
