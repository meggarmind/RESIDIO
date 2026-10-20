import { describe, expect, it } from 'vitest';
import { formatPdfDate } from '@/lib/pdf/format-date';

describe('formatPdfDate', () => {
  it('writes a calendar day as dd mmmm yyyy with the month as a name', () => {
    expect(formatPdfDate('2026-08-31')).toBe('31 August 2026');
    expect(formatPdfDate('2026-10-05')).toBe('5 October 2026');
  });

  it('shows an instant on its Africa/Lagos day', () => {
    // 23:30 UTC on 31 August is 00:30 on 1 September in Lagos.
    expect(formatPdfDate('2026-08-31T23:30:00Z')).toBe('1 September 2026');
    expect(formatPdfDate(new Date('2026-10-12T11:00:00Z'))).toBe('12 October 2026');
  });

  it('is empty for something that is not a date', () => {
    expect(formatPdfDate('soon')).toBe('');
  });
});
