// Regression for #655: stored statement dates are 'YYYY-MM-DD' (DATE columns).
// Display sites must show that calendar day in every viewer time zone, not
// re-interpret it as UTC midnight in the viewer's zone.
process.env.TZ = 'Africa/Lagos';

import { afterAll, describe, expect, it } from 'vitest';
import { formatDate as modernFormatDate } from '@/components/reports/templates/modern-template';
import { formatDate as traditionalFormatDate } from '@/components/reports/templates/traditional-template';
import { formatCalendarDate } from '@/lib/utils/calendar-date';

const ORIGINAL_TZ = process.env.TZ;
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

const TIME_ZONES = ['Africa/Lagos', 'America/New_York', 'Pacific/Honolulu', 'UTC', 'Pacific/Auckland'];

// [stored value, modern (d MMM yyyy), traditional (d MMMM yyyy), email-import page (en-US)]
const CASES: Array<[string, string, string, string]> = [
  ['2026-10-15', '15 Oct 2026', '15 October 2026', '10/15/2026'],
  ['2026-11-01', '1 Nov 2026', '1 November 2026', '11/1/2026'],
  ['2026-10-31', '31 Oct 2026', '31 October 2026', '10/31/2026'],
  ['2028-02-29', '29 Feb 2028', '29 February 2028', '2/29/2028'],
  ['2027-01-01', '1 Jan 2027', '1 January 2027', '1/1/2027'],
];

describe.each(TIME_ZONES)('calendar date display in %s (#655)', (tz) => {
  it.each(CASES)('%s', (stored, modern, traditional, emailImport) => {
    process.env.TZ = tz;
    expect(modernFormatDate(stored)).toBe(modern);
    expect(traditionalFormatDate(stored)).toBe(traditional);
    // email-imports/[importId]/page.tsx: formatDate is formatCalendarDate(date) (local to the component)
    expect(formatCalendarDate(stored, 'en-US')).toBe(emailImport);
  });
});
