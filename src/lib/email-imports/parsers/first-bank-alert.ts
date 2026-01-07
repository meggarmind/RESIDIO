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
  /account\s*\*{3,4}(\d{4})\s*(?:has been\s*)?credited\s*(?:with\s*)?(?:NGN|₦)?\s*([\d,]+\.?\d*)\s*(?:by|from)\s*([^on]+?)\s*on\s*([\d/\-A-Za-z]+)/i,

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

/**
 * Parse date string to Date object
 */
function parseDate(dateStr: string): Date | null {
  const trimmed = dateStr.trim();

  // DD/MM/YYYY or DD-MM-YYYY
  const ddmmyyyy = trimmed.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/);
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
    const fullYear = year.length === 2 ? `20${year}` : year;
    return new Date(parseInt(fullYear), parseInt(month) - 1, parseInt(day));
  }

  // DD-MMM-YYYY (e.g., 15-Dec-2024)
  const ddmmmyyyy = trimmed.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (ddmmmyyyy) {
    const [, day, monthStr, year] = ddmmmyyyy;
    const months: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };
    const month = months[monthStr.toLowerCase()];
    if (month !== undefined) {
      return new Date(parseInt(year), month, parseInt(day));
    }
  }

  return null;
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
 * Parse a First Bank transaction alert email.
 */
export function parseFirstBankAlert(
  body: string,
  subject?: string | null
): ParsedEmailTransaction | null {
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
        return {
          amount,
          transactionType: 'credit',
          description: description || extractSenderFromText(text),
          reference: extractReference(text),
          transactionDate: extractDate(text) || new Date(),
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
        return {
          amount,
          transactionType: 'debit',
          description: extractDescriptionFromText(text),
          reference: extractReference(text),
          transactionDate: extractDate(text) || new Date(),
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
  const text = `${subject || ''} ${body}`.toLowerCase();

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
