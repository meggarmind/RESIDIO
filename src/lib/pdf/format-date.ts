import { lagosParts } from '@/lib/whatsapp/assistant-format';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * `31 August 2026`, the date format of every PDF report (CORE.md section 4). A `YYYY-MM-DD` value is a
 * calendar day; anything else is an instant shown on its Africa/Lagos day. The month is a name, never a
 * number, so it reads the same to day-first and month-first readers.
 */
export function formatPdfDate(value: string | Date): string {
  let year: number;
  let month: number;
  let day: number;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    [year, month, day] = value.split('-').map(Number);
  } else {
    const date = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return '';
    ({ year, month, day } = lagosParts(date));
  }
  return `${day} ${MONTHS[month - 1]} ${year}`;
}
