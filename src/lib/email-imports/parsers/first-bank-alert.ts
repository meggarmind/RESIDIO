/**
 * First Bank Transaction Alert Parser
 *
 * Parses transaction alert emails from First Bank Nigeria.
 * Extracts transaction details from email body text using regex patterns.
 *
 * Common alert formats:
 *
 * Credit Alert:
 * "Your account ****1234 has been credited with NGN 50,000.00 by JOHN DOE on 01/01/2025.
 *  Ref: TRF/123456789. Avail Bal: NGN 150,000.00"
 *
 * Debit Alert:
 * "Debit Alert: NGN 25,000.00 debited from ****5678. Ref: TRF/123456 on 01/01/2025.
 *  Avail Bal: NGN 125,000.00"
 *
 * Alternative formats:
 * "Dear Customer, Your account ****1234 has been credited with NGN 100,000.00
 *  from SMITH JAMES PAYMENT on 15-Dec-2024. Thank you for banking with First Bank."
 */

import type { ParsedEmailTransaction } from '@/types/database';
import { calendarDate } from '@/lib/utils/calendar-date';

// ============================================================
// HTML Stripping Utility
// ============================================================

/**
 * Strip HTML tags from content and decode common HTML entities.
 * Converts HTML to plain text for parsing.
 */
export function stripHtmlTags(html: string): string {
  return html
    // Replace <br>, <p>, <div>, <tr> with newlines for structure preservation
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|tr|li)[^>]*>/gi, '\n')
    // Remove all remaining HTML tags
    .replace(/<[^>]+>/g, '')
    // Decode common HTML entities
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, '/')
    // Clean up excessive whitespace
    .replace(/\n\s*\n/g, '\n')
    .trim();
}
// ============================================================
// Regex Patterns for First Bank Alerts
// ============================================================

/**
 * Pattern groups:
 * - accountLast4: Last 4 digits of account (e.g., "1234")
 * - amount: Transaction amount (e.g., "50,000.00")
 * - sender: Sender/description (e.g., "JOHN DOE")
 * - date: Transaction date
 * - reference: Transaction reference
 */

// Credit patterns
const CREDIT_PATTERNS = [
  // "account ****1234 has been credited with NGN 50,000.00 by JOHN DOE on 01/01/2025"
  /account\s*\*{3,4}(\d{4})\s*(?:has been\s*)?credited\s*(?:with\s*)?(?:NGN|₦)?\s*([\d,]+\.?\d*)\s*(?:by|from)\s*(.+?)\s+on\s+(\d{1,2}[/\-][\d/\-A-Za-z]+)/i,

  // "NGN 50,000.00 credited to your account ****1234 from JOHN DOE"
  /(?:NGN|₦)?\s*([\d,]+\.?\d*)\s*credited\s*(?:to\s*)?(?:your\s*)?account\s*\*{3,4}(\d{4})\s*(?:from|by)\s*([^\.]+)/i,

  // "Credit Alert: NGN 50,000.00 has been credited to your account ****1234"
  /credit\s*alert[:\s]*(?:NGN|₦)?\s*([\d,]+\.?\d*)\s*(?:has been\s*)?credited\s*(?:to\s*)?(?:your\s*)?account\s*\*{3,4}(\d{4})/i,

  // "Your account ending 1234 has been credited NGN 50,000.00"
  /account\s*(?:ending|no\.?)\s*(\d{4})\s*(?:has been\s*)?credited\s*(?:NGN|₦)?\s*([\d,]+\.?\d*)/i,
];

// Debit patterns
const DEBIT_PATTERNS = [
  // "NGN 25,000.00 debited from ****5678"
  /(?:NGN|₦)?\s*([\d,]+\.?\d*)\s*debited\s*from\s*(?:your\s*)?(?:account\s*)?\*{3,4}(\d{4})/i,

  // "Debit Alert: NGN 25,000.00 has been debited from your account ****5678"
  /debit\s*alert[:\s]*(?:NGN|₦)?\s*([\d,]+\.?\d*)\s*(?:has been\s*)?debited\s*from\s*(?:your\s*)?account\s*\*{3,4}(\d{4})/i,

  // "Your account ****5678 has been debited with NGN 25,000.00"
  /account\s*\*{3,4}(\d{4})\s*(?:has been\s*)?debited\s*(?:with\s*)?(?:NGN|₦)?\s*([\d,]+\.?\d*)/i,
];

// Reference patterns
const REFERENCE_PATTERNS = [
  /ref(?:erence)?[:\s]*([A-Z0-9/\-]+)/i,
  /trf[:/]?\s*([A-Z0-9]+)/i,
  /session\s*id[:\s]*([A-Z0-9]+)/i,
];

// Date patterns
const DATE_PATTERNS = [
  /on\s*([\d]{1,2}[/\-][\d]{1,2}[/\-][\d]{2,4})/i,
  /on\s*([\d]{1,2}-[A-Za-z]{3}-[\d]{4})/i,
  /date[:\s]*([\d]{1,2}[/\-][\d]{1,2}[/\-][\d]{2,4})/i,
];

// ============================================================
// Parser Functions
// ============================================================

/**
 * Extract amount from string (e.g., "50,000.00" → 50000)
 */
function parseAmount(amountStr: string): number {
  const cleaned = amountStr.replace(/[,\s]/g, '');
  const amount = parseFloat(cleaned);
  return isNaN(amount) ? 0 : amount;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// Optional trailing clock time: "10:30", "10:30:45", "03:40 PM". Only the calendar day is
// kept; the time is validated so garbage is not mistaken for a date, then discarded.
const TIME_SUFFIX = String.raw`(?:[\sT,]+(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?\s*(?:[AaPp][Mm])?)?`;

/** A real calendar day as UTC midnight, or null (31-Feb must not roll into March). */
function validCalendarDate(year: number, month: number, day: number): Date | null {
  const date = calendarDate(year, month, day);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

/**
 * Parse a date string to a calendar day (UTC midnight), ignoring any trailing time.
 * Accepts DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, DD-MMM-YYYY and DD-MMM-YY.
 */
function parseDate(dateStr: string): Date | null {
  const trimmed = dateStr.trim();

  // DD/MM/YYYY or DD-MM-YYYY
  const ddmmyyyy = trimmed.match(new RegExp(String.raw`^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})${TIME_SUFFIX}$`));
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
    const fullYear = year.length === 2 ? `20${year}` : year;
    return validCalendarDate(parseInt(fullYear), parseInt(month), parseInt(day));
  }

  // YYYY-MM-DD
  const iso = trimmed.match(new RegExp(String.raw`^(\d{4})-(\d{1,2})-(\d{1,2})${TIME_SUFFIX}$`));
  if (iso) {
    const [, year, month, day] = iso;
    return validCalendarDate(parseInt(year), parseInt(month), parseInt(day));
  }

  // DD-MMM-YYYY (15-Dec-2024) or DD-MMM-YY (12-Jan-26)
  const ddmmm = trimmed.match(new RegExp(String.raw`^(\d{1,2})-([A-Za-z]{3})-(\d{4}|\d{2})${TIME_SUFFIX}$`));
  if (ddmmm) {
    const [, day, monthStr, year] = ddmmm;
    const month = MONTHS[monthStr.toLowerCase()];
    if (month !== undefined) {
      const fullYear = year.length === 2 ? 2000 + parseInt(year) : parseInt(year);
      return validCalendarDate(fullYear, month, parseInt(day));
    }
  }

  return null;
}

/** Mask a value to its shape ("15-Oct-2026" -> "99-Aaa-9999") so it can be logged safely. */
function shapeOf(value: string | null): string | null {
  if (value === null) return null;
  return value.slice(0, 40).replace(/\d/g, '9').replace(/[A-Za-z]/g, 'a');
}

/**
 * Extract reference from text
 */
function extractReference(text: string): string | null {
  for (const pattern of REFERENCE_PATTERNS) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return null;
}

/**
 * Extract date from text
 */
function extractDate(text: string): Date | null {
  for (const pattern of DATE_PATTERNS) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const date = parseDate(match[1]);
      if (date) return date;
    }
  }
  return null;
}

/**
 * An alert whose date cannot be read is NOT given today's date (that lands the payment in
 * the wrong month): the parser returns null and the caller records it as unparsed. Only
 * structure is logged, never the body, which carries account numbers and names.
 */
function warnNoDate(layout: string, details: Record<string, unknown>): void {
  console.warn('[first-bank-alert] No transaction date could be read; alert left unparsed.', { layout, ...details });
}

/**
 * Parse a First Bank transaction alert email. Returns null when the alert cannot be parsed,
 * including when no calendar date can be read from it.
 */
export function parseFirstBankAlert(
  body: string,
  subject?: string | null
): ParsedEmailTransaction | null {
  // Try structured parser first
  const structured = parseStructuredAlert(body, subject);
  if (structured) return structured;

  const text = `${subject || ''} ${body}`.replace(/\s+/g, ' ');

  // Try credit patterns
  for (const pattern of CREDIT_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      // Different patterns capture groups in different order
      let amount: number;
      let accountLast4: string;
      let description: string | null = null;

      if (pattern.source.startsWith('account')) {
        // Pattern: account ****1234 ... NGN amount by sender
        accountLast4 = match[1];
        amount = parseAmount(match[2]);
        description = match[3]?.trim() || null;
      } else if (pattern.source.includes('credited\\s*(?:to')) {
        // Pattern: NGN amount credited to account
        amount = parseAmount(match[1]);
        accountLast4 = match[2];
        description = match[3]?.trim() || null;
      } else {
        // Default order: amount, accountLast4
        amount = parseAmount(match[1]);
        accountLast4 = match[2];
      }

      if (amount > 0) {
        // Prefer the date the matched pattern captured (4th group of the "by ... on <date>" form).
        const captured = pattern.source.startsWith('account') && match[4] ? parseDate(match[4]) : null;
        const transactionDate = captured || extractDate(text);
        if (!transactionDate) {
          warnNoDate('sentence-credit', { patternIndex: CREDIT_PATTERNS.indexOf(pattern), capturedDate: shapeOf(match[4] ?? null) });
          return null;
        }
        return {
          amount,
          transactionType: 'credit',
          description: description || extractSenderFromText(text),
          reference: extractReference(text),
          transactionDate,
          bankAccountLast4: accountLast4,
        };
      }
    }
  }

  // Try debit patterns
  for (const pattern of DEBIT_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      let amount: number;
      let accountLast4: string;

      // First group is usually amount, second is account
      if (pattern.source.startsWith('account')) {
        accountLast4 = match[1];
        amount = parseAmount(match[2]);
      } else {
        amount = parseAmount(match[1]);
        accountLast4 = match[2];
      }

      if (amount > 0) {
        const transactionDate = extractDate(text);
        if (!transactionDate) {
          warnNoDate('sentence-debit', { patternIndex: DEBIT_PATTERNS.indexOf(pattern) });
          return null;
        }
        return {
          amount,
          transactionType: 'debit',
          description: extractDescriptionFromText(text),
          reference: extractReference(text),
          transactionDate,
          bankAccountLast4: accountLast4,
        };
      }
    }
  }

  return null;
}

/**
 * Extract sender name from text (for credit alerts)
 */
function extractSenderFromText(text: string): string | null {
  // Pattern: "from SENDER NAME" or "by SENDER NAME"
  const patterns = [
    /(?:from|by)\s+([A-Z][A-Z\s]+?)(?:\s+on|\s+ref|\s+\d|\.)/i,
    /(?:from|by)\s+([^\.]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const sender = match[1].trim();
      // Filter out common non-sender text
      if (sender.length > 2 && !sender.toLowerCase().includes('account')) {
        return sender;
      }
    }
  }

  return null;
}

/**
 * Extract description from text (for debit alerts)
 */
function extractDescriptionFromText(text: string): string | null {
  // Pattern: "for PURPOSE" or "to RECIPIENT"
  const patterns = [
    /(?:for|to)\s+([A-Z][A-Z\s]+?)(?:\s+on|\s+ref|\s+\d|\.)/i,
    /(?:for|to)\s+([^\.]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const desc = match[1].trim();
      if (desc.length > 2 && !desc.toLowerCase().includes('account')) {
        return desc;
      }
    }
  }

  return 'Debit transaction';
}

/**
 * Check if email body looks like a First Bank alert
 */
export function isFirstBankAlert(body: string, subject?: string | null): boolean {
  const plainText = stripHtmlTags(body);
  const text = `${subject || ''} ${plainText}`.toLowerCase();

  const indicators = [
    'first bank',
    'firstbank',
    'credit alert',
    'debit alert',
    'has been credited',
    'has been debited',
    'credited with',
    'debited from',
  ];

  return indicators.some((ind) => text.includes(ind));
}

// ============================================================
// Structured / Table Parser
// ============================================================

/**
 * Parse structured alert (Key: Value format)
 * Example:
 * Date/Time
 * 12-Jan-26 03:40 PM
 * Account Number
 * 202XXXX725
 * Amount
 * 15,000.00 CR
 * Narration
 * FIP:GTB/ANIH LANA/NIP
 */
function parseStructuredAlert(body: string, subject?: string | null): ParsedEmailTransaction | null {
  // Strip HTML tags if present (emails are often stored as HTML)
  const plainText = stripHtmlTags(body);

  // Normalize newlines and spaces
  const lines = plainText.split(/\r?\n/).map((l: string) => l.trim()).filter((l: string) => l.length > 0);
  const text = lines.join('\n');

  // Helper to find value after a key
  const findValue = (keyPattern: RegExp): string | null => {
    for (let i = 0; i < lines.length; i++) {
      if (keyPattern.test(lines[i])) {
        // Value could be on the same line (Key: Value) or next line
        const sameLineMatch = lines[i].match(new RegExp(String.raw`${keyPattern.source}(?![\w/])[:\s]*(.+)`, 'i'));
        if (sameLineMatch && sameLineMatch[1] && sameLineMatch[1].trim().length > 1) {
          return sameLineMatch[1].trim();
        }
        // Bare header: the value is on the next non-empty line (empty lines are already dropped)
        if (i + 1 < lines.length) {
          return lines[i + 1].trim();
        }
      }
    }
    return null;
  };

  const amountStr = findValue(/(?:amount|amt)/i);
  const dateStr = findValue(/(?:date\/time|date)/i);
  const accountStr = findValue(/(?:account|acct)\s*(?:number|no)/i);
  const narrationStr = findValue(/(?:narration|description|remarks)/i);
  const balanceStr = findValue(/(?:cleared|avail)?\s*balance/i);

  if (!amountStr || !dateStr) return null;

  // Parse Amount using generic helper from existing code (but need to handle CR/DR suffix)
  const amount = parseAmount(amountStr.replace(/CR|DR/i, ''));
  // Determine type from suffix or context
  let type: 'credit' | 'debit' = 'credit'; // Default

  if (amountStr.toUpperCase().includes('DR') || (subject && subject.toLowerCase().includes('debit'))) {
    type = 'debit';
  } else if (amountStr.toUpperCase().includes('CR') || (subject && subject.toLowerCase().includes('credit'))) {
    type = 'credit';
  }

  // Parse Date (e.g. "12-Jan-26 03:40 PM", "15/10/2026 10:30"); only the calendar day is kept.
  const date = parseDate(dateStr);
  if (!date) {
    warnNoDate('structured', { linesFound: lines.length, dateValueShape: shapeOf(dateStr) });
    return null;
  }

  // Account
  const accountLast4 = accountStr ? extractAccountNumber(accountStr) : null;

  if (amount > 0) {
    return {
      amount,
      transactionType: type,
      description: narrationStr || 'Transaction Alert',
      reference: extractReference(narrationStr || '') || extractReference(text) || null,
      transactionDate: date,
      bankAccountLast4: accountLast4,
    };
  }

  return null;
}

/**
 * Extract simple account number if not using the exported complex one
 */
function extractAccountNumber(text: string): string | null {
  const match = text.match(/[\dX*]{4,}(\d{4})/);
  return match ? match[1] : null;
}
