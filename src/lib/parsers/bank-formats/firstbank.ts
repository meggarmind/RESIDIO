/**
 * FirstBank Statement Format Configuration
 *
 * This module defines the parsing configuration for FirstBank Nigeria
 * bank statements in CSV and Excel formats.
 */

import type { BankFormatConfig, ColumnMapping } from '@/types/database';

// FirstBank default column mapping
// Note: Column names may vary slightly between statement types
export const FIRSTBANK_COLUMNS: ColumnMapping = {
  date: 'Transaction Date',
  description: 'Narration',
  credit: 'Credit',
  debit: 'Debit',
  reference: 'Reference',
  balance: 'Balance',
};

// Alternative column names that FirstBank might use
export const FIRSTBANK_COLUMN_ALIASES: Record<keyof ColumnMapping, string[]> = {
  date: ['Transaction Date', 'Date', 'Trans Date', 'Value Date', 'POST DATE'],
  description: ['Narration', 'Description', 'Details', 'Remarks', 'NARRATION'],
  credit: ['Credit', 'Credit Amount', 'CR', 'CREDIT'],
  debit: ['Debit', 'Debit Amount', 'DR', 'DEBIT'],
  reference: ['Reference', 'Ref', 'Transaction Ref', 'Reference No', 'REFERENCE'],
  balance: ['Balance', 'Running Balance', 'Available Balance', 'BALANCE'],
};

// FirstBank format configuration
export const FIRSTBANK_CONFIG: BankFormatConfig = {
  name: 'FirstBank Nigeria',
  bankName: 'FirstBank',
  dateFormat: 'DD/MM/YYYY', // Primary format, also supports DD-MMM-YYYY
  defaultColumns: FIRSTBANK_COLUMNS,
  headerRowIndex: 0, // Usually first row, but some statements have header info rows
  skipRows: [], // Rows to skip (e.g., summary rows at the end)
};

// Date formats used by FirstBank (in order of likelihood)
export const FIRSTBANK_DATE_FORMATS = [
  'DD/MM/YYYY',
  'DD-MM-YYYY',
  'DD-MMM-YYYY', // e.g., 15-Dec-2024
  'YYYY-MM-DD',
  'MM/DD/YYYY',
  'DD/MM/YY',
];

/**
 * Detect if a row is a FirstBank header row
 */
export function isFirstBankHeaderRow(row: Record<string, unknown>): boolean {
  const values = Object.values(row).map(v => String(v || '').toLowerCase());

  // Check for common header indicators
  const headerIndicators = ['date', 'narration', 'credit', 'debit', 'balance', 'reference'];
  const matchCount = headerIndicators.filter(indicator =>
    values.some(v => v.includes(indicator))
  ).length;

  return matchCount >= 3; // At least 3 header indicators present
}

/**
 * Detect if a row is a summary/footer row to skip
 */
export function isFirstBankSummaryRow(row: Record<string, unknown>): boolean {
  const values = Object.values(row).map(v => String(v || '').toLowerCase());

  // Check for summary row indicators
  const summaryIndicators = [
    'total',
    'opening balance',
    'closing balance',
    'summary',
    'grand total',
  ];

  return summaryIndicators.some(indicator =>
    values.some(v => v.includes(indicator))
  );
}

/**
 * Parse FirstBank amount string to number
 * Handles formats like "1,234.56", "(1,234.56)", "1234.56 CR", etc.
 */
export function parseFirstBankAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const strValue = String(value).trim();

  // Check for empty or zero indicators
  if (strValue === '' || strValue === '-' || strValue === '0.00' || strValue === '0') {
    return null;
  }

  // Remove currency symbols and whitespace
  let cleanValue = strValue.replace(/[₦NGN\s]/gi, '');

  // Check for negative indicators
  const isNegative = cleanValue.includes('(') || cleanValue.includes('-') || /DR$/i.test(cleanValue);

  // Remove all non-numeric characters except decimal point
  cleanValue = cleanValue.replace(/[^0-9.]/g, '');

  // Parse the number
  const amount = parseFloat(cleanValue);

  if (isNaN(amount)) {
    return null;
  }

  return isNegative ? -amount : amount;
}

/**
 * Parse FirstBank date string to Date object
 */
export function parseFirstBankDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const strValue = String(value).trim();

  // If it's already a Date object
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  // Try parsing with different formats

  // DD/MM/YYYY or DD-MM-YYYY
  const ddmmyyyy = strValue.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (!isNaN(date.getTime())) return date;
  }

  // DD-MMM-YYYY (e.g., 15-Dec-2024)
  const ddmmmyyyy = strValue.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (ddmmmyyyy) {
    const [, day, monthStr, year] = ddmmmyyyy;
    const months: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };
    const month = months[monthStr.toLowerCase()];
    if (month !== undefined) {
      const date = new Date(parseInt(year), month, parseInt(day));
      if (!isNaN(date.getTime())) return date;
    }
  }

  // YYYY-MM-DD
  const yyyymmdd = strValue.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (yyyymmdd) {
    const [, year, month, day] = yyyymmdd;
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (!isNaN(date.getTime())) return date;
  }

  // Fallback to native Date parsing
  const fallbackDate = new Date(strValue);
  return isNaN(fallbackDate.getTime()) ? null : fallbackDate;
}

/**
 * Auto-detect column mapping from header row
 */
export function detectFirstBankColumns(headerRow: Record<string, unknown>): ColumnMapping | null {
  const mapping: Partial<ColumnMapping> = {};
  const entries = Object.entries(headerRow);

  for (const [key, value] of entries) {
    const headerValue = String(value || '').toLowerCase().trim();

    // Check each column type against its aliases
    for (const [colType, aliases] of Object.entries(FIRSTBANK_COLUMN_ALIASES)) {
      const normalizedAliases = aliases.map(a => a.toLowerCase());
      if (normalizedAliases.includes(headerValue)) {
        mapping[colType as keyof ColumnMapping] = key;
        break;
      }
    }
  }

  // Validate we have the required columns
  if (mapping.date && mapping.description && (mapping.credit || mapping.debit)) {
    return {
      date: mapping.date || '',
      description: mapping.description || '',
      credit: mapping.credit || '',
      debit: mapping.debit || '',
      reference: mapping.reference || '',
      balance: mapping.balance,
    };
  }

  return null;
}
