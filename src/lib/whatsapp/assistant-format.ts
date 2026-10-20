/**
 * Pure text helpers for the resident WhatsApp Assistant (#804): amounts, dates,
 * references, the estate office contact line and office hours, and keyword
 * parsing. No database access here, so every reply shape is unit-testable.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const LAGOS_OFFSET_MS = 60 * 60 * 1000; // Africa/Lagos is UTC+1 all year (no DST).

export function formatNaira(amount: number): string {
  const sign = amount < 0 ? '−' : '';
  return `${sign}₦${Math.abs(amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Calendar parts of an instant in Africa/Lagos. */
export function lagosParts(now: Date): { year: number; month: number; day: number; weekday: number; minutes: number } {
  const shifted = new Date(now.getTime() + LAGOS_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

/** The UTC instant of 00:00 Africa/Lagos on the given calendar day (month 1-12, may overflow). */
export function lagosMidnight(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day) - LAGOS_OFFSET_MS);
}

/**
 * `12 Oct 2026`. A 'YYYY-MM-DD' value is a calendar day; anything else is an
 * instant shown on its Africa/Lagos day.
 */
export function formatDay(value: string | Date): string {
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

/** Payment references are shown by their last 4 characters only (#804 harmonised format). */
export function maskReference(reference: string | null | undefined): string | null {
  const trimmed = reference?.trim();
  if (!trimmed) return null;
  return `ref ••••${trimmed.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Statement periods (#804 decisions 22-23)

export type StatementPeriod = 'this_month' | 'this_year' | 'last_six_months' | 'last_twelve_months' | 'all_time';

export const PERIOD_LABELS: Record<StatementPeriod, string> = {
  this_month: 'this month',
  this_year: 'this year',
  last_six_months: 'last 6 months',
  last_twelve_months: 'last 12 months',
  all_time: 'all time',
};
export const PERIODS: StatementPeriod[] = ['this_month', 'this_year', 'last_six_months', 'last_twelve_months', 'all_time'];

/** Period boundaries in Africa/Lagos (#804 decisions 22-23); "last 6 months" is this month plus the 5 before. */
export function statementRange(period: StatementPeriod, now: Date): { from: Date | null; to: Date } {
  const { year, month } = lagosParts(now);
  const from = period === 'this_month'
    ? lagosMidnight(year, month, 1)
    : period === 'this_year'
      ? lagosMidnight(year, 1, 1)
      : period === 'last_six_months'
        ? lagosMidnight(year, month - 5, 1)
        : period === 'last_twelve_months'
          ? lagosMidnight(year, month - 11, 1)
          : null;
  return { from, to: now };
}

/** The Lagos calendar day of an instant, as `YYYY-MM-DD`. */
export function lagosDateString(date: Date): string {
  const { year, month, day } = lagosParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** The period as Lagos calendar dates for the account statement; all time starts at 2000-01-01. */
export function statementDates(period: StatementPeriod, now: Date): { fromDate: string; toDate: string } {
  const { from, to } = statementRange(period, now);
  return { fromDate: from ? lagosDateString(from) : '2000-01-01', toDate: lagosDateString(to) };
}

/** `a***@gmail.com` (#804 decision 24). */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  return `${local.slice(0, 1)}***@${domain ?? ''}`;
}

// ---------------------------------------------------------------------------
// Estate office hours (#804 amendment 3)

export type OfficeDayHours =
  | { mode: 'closed' }
  | { mode: 'all_day' }
  | { mode: 'hours'; from: string; to: string };

/** Index 0 is Sunday, matching Date#getDay. */
export type OfficeHours = OfficeDayHours[];

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/** Reads the `estate_office_hours` setting; anything malformed reads as "not set". */
export function parseOfficeHours(value: unknown): OfficeHours | null {
  const raw = typeof value === 'string' ? safeJson(value) : value;
  if (!Array.isArray(raw) || raw.length !== 7) return null;
  const days: OfficeHours = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') return null;
    const { mode, from, to } = entry as Record<string, unknown>;
    if (mode === 'closed' || mode === 'all_day') days.push({ mode });
    else if (mode === 'hours' && typeof from === 'string' && typeof to === 'string' && TIME.test(from) && TIME.test(to) && toMinutes(from) < toMinutes(to)) {
      days.push({ mode, from, to });
    } else return null;
  }
  return days.every((day) => day.mode === 'closed') ? null : days;
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function formatClock(time: string): string {
  const minutes = toMinutes(time);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour < 12 ? 'am' : 'pm';
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}${minute ? `:${String(minute).padStart(2, '0')}` : ''}${suffix}`;
}

function dayHoursText(day: OfficeDayHours): string {
  return day.mode === 'all_day' ? 'all day' : day.mode === 'hours' ? `${formatClock(day.from)} to ${formatClock(day.to)}` : 'closed';
}

function sameHours(left: OfficeDayHours, right: OfficeDayHours): boolean {
  return dayHoursText(left) === dayHoursText(right);
}

/** `weekdays 5pm to 10pm and all day at weekends`; closed days are left out. */
export function describeOfficeHours(hours: OfficeHours): string {
  // Monday-first runs of consecutive days with the same hours.
  const order = [1, 2, 3, 4, 5, 6, 0];
  const runs: Array<{ days: number[]; hours: OfficeDayHours }> = [];
  for (const index of order) {
    const last = runs[runs.length - 1];
    if (last && sameHours(last.hours, hours[index])) last.days.push(index);
    else runs.push({ days: [index], hours: hours[index] });
  }

  const parts = runs
    .filter((run) => run.hours.mode !== 'closed')
    .map((run) => {
      const text = dayHoursText(run.hours);
      const key = run.days.join(',');
      if (run.days.length === 7) return `${text} every day`;
      if (key === '1,2,3,4,5') return `weekdays ${text}`;
      if (key === '6,0') return `${text} at weekends`;
      const first = WEEKDAYS[run.days[0]].slice(0, 3);
      const last = WEEKDAYS[run.days[run.days.length - 1]].slice(0, 3);
      return run.days.length === 1 ? `${WEEKDAYS[run.days[0]]}s ${text}` : `${first} to ${last} ${text}`;
    });
  if (parts.length <= 1) return parts[0] || '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** `The office is back at 5pm today.` when the office is closed now; null when open. */
export function officeBackLine(hours: OfficeHours, now: Date): string | null {
  const { weekday, minutes } = lagosParts(now);
  const today = hours[weekday];
  if (today.mode === 'all_day') return null;
  if (today.mode === 'hours') {
    if (minutes >= toMinutes(today.from) && minutes < toMinutes(today.to)) return null;
    if (minutes < toMinutes(today.from)) return `The office is back at ${formatClock(today.from)} today.`;
  }
  for (let offset = 1; offset <= 7; offset += 1) {
    const index = (weekday + offset) % 7;
    const day = hours[index];
    if (day.mode === 'closed') continue;
    const when = offset === 1 ? 'tomorrow' : `on ${WEEKDAYS[index]}`;
    return day.mode === 'all_day' ? `The office is back ${when}.` : `The office is back at ${formatClock(day.from)} ${when}.`;
  }
  return null;
}

export interface EstateContact {
  phone: string | null;
  email: string | null;
  hours: OfficeHours | null;
}

/**
 * The estate office contact line, read from settings on every message (#804
 * amendment 4). Null when both phone and email are empty, so callers omit it.
 */
export function contactLine(contact: EstateContact, now: Date): string | null {
  const channels = [contact.phone, contact.email].filter((value): value is string => !!value);
  if (channels.length === 0) return null;
  const hoursText = contact.hours ? describeOfficeHours(contact.hours) : '';
  const line = `Contact the estate office on ${channels.join(' or ')}${hoursText ? `, ${hoursText}` : ''}.`;
  const back = contact.hours ? officeBackLine(contact.hours, now) : null;
  return back ? `${line} ${back}` : line;
}

/** Last line of every answer. */
export function answerFooter(hasContact: boolean): string {
  return hasContact ? 'Reply 0 for menu or 9 to contact the estate office.' : 'Reply 0 for menu.';
}

// ---------------------------------------------------------------------------
// Keywords (#804 harmonised: numbers and fixed keywords only, no free-text parsing)

export type AssistantIntent = 'owe' | 'payments' | 'statement' | 'wallet' | 'pay' | 'notices' | 'contact' | 'email' | 'reminders' | 'report' | 'receipt' | 'clearance';

export const DEFAULT_KEYWORDS: Record<string, AssistantIntent> = {
  owe: 'owe',
  outstanding: 'owe',
  arrears: 'owe',
  debt: 'owe',
  payments: 'payments',
  paid: 'payments',
  receipt: 'receipt',
  statement: 'statement',
  history: 'statement',
  wallet: 'wallet',
  pay: 'pay',
  'bank details': 'pay',
  announcement: 'notices',
  announcements: 'notices',
  news: 'notices',
  notice: 'notices',
  notices: 'notices',
  contact: 'contact',
  email: 'email',
  reminders: 'reminders',
  report: 'report',
  clearance: 'clearance',
};

const INTENTS = new Set<AssistantIntent>(['owe', 'payments', 'statement', 'wallet', 'pay', 'notices', 'contact', 'email', 'reminders', 'report', 'receipt', 'clearance']);

/**
 * The office's extra phrasing, one `phrase = item` per line (item is one of
 * owe, payments, statement, wallet, pay, notices, contact, email, reminders, report, receipt, clearance). Bad lines are skipped.
 */
export function parseKeywordSynonyms(value: unknown): Record<string, AssistantIntent> {
  const text = typeof value === 'string' ? value : '';
  const keywords: Record<string, AssistantIntent> = {};
  for (const line of text.split('\n')) {
    const [phrase, intent] = line.split('=').map((part) => normalizeInput(part ?? ''));
    if (phrase && INTENTS.has(intent as AssistantIntent)) keywords[phrase] = intent as AssistantIntent;
  }
  return keywords;
}

export function normalizeInput(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
}
