/**
 * CSV Parser
 *
 * Parses CSV files using PapaParse library.
 * Handles various CSV formats and encodings.
 */

import Papa from 'papaparse';
import type { ColumnMapping } from '@/types/database';
import type { ParsedRow } from '@/lib/validators/import';
import { getBankParser, detectBankFormat } from './bank-formats';

export interface CSVParseOptions {
  /** Bank format to use (e.g., 'firstbank'). Auto-detects if not provided. */
  bankFormat?: string;
  /** Custom column mapping. Auto-detects if not provided. */
  columnMapping?: ColumnMapping;
  /** Filter transactions by type */
  transactionFilter?: 'credit' | 'debit' | 'all';
  /** Skip header rows (auto-detected if not provided) */
  skipHeaderRows?: number;
}

export interface CSVParseResult {
  rows: ParsedRow[];
  detectedColumns: ColumnMapping | null;
  headerRowIndex: number;
  rawData: Record<string, unknown>[];
  totalCredits: number;
  totalDebits: number;
  dateRange: {
    start: Date | null;
    end: Date | null;
  };
  errors: string[];
}

/**
 * Parse CSV content from a string
 */
export async function parseCSVString(
  csvContent: string,
  options: CSVParseOptions = {}
): Promise<CSVParseResult> {
  return new Promise((resolve) => {
    Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim(),
      complete: (results) => {
        resolve(processParseResults(results.data as Record<string, unknown>[], options));
      },
      error: (error: Error) => {
        resolve({
          rows: [],
          detectedColumns: null,
          headerRowIndex: 0,
          rawData: [],
          totalCredits: 0,
          totalDebits: 0,
          dateRange: { start: null, end: null },
          errors: [error.message],
        });
      },
    });
  });
}

/**
 * Parse CSV file
 */
export async function parseCSVFile(
  file: File,
  options: CSVParseOptions = {}
): Promise<CSVParseResult> {
  return new Promise((resolve) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim(),
      complete: (results) => {
        resolve(processParseResults(results.data as Record<string, unknown>[], options));
      },
      error: (error: Error) => {
        resolve({
          rows: [],
          detectedColumns: null,
          headerRowIndex: 0,
          rawData: [],
          totalCredits: 0,
          totalDebits: 0,
          dateRange: { start: null, end: null },
          errors: [error.message],
        });
      },
    });
  });
}

/**
 * Process parsed results into standardized format
 */
function processParseResults(
  rawData: Record<string, unknown>[],
  options: CSVParseOptions
): CSVParseResult {
  const errors: string[] = [];

  if (rawData.length === 0) {
    return {
      rows: [],
      detectedColumns: null,
      headerRowIndex: 0,
      rawData: [],
      totalCredits: 0,
      totalDebits: 0,
      dateRange: { start: null, end: null },
      errors: ['No data found in file'],
    };
  }

  // Detect or use provided bank format
  const bankFormat = options.bankFormat || detectBankFormat(rawData);
  const parser = getBankParser(bankFormat);

  if (!parser) {
    errors.push(`Unknown bank format: ${bankFormat}`);
  }

  // Find header row and detect columns
  let headerRowIndex = 0;
  let detectedColumns: ColumnMapping | null = options.columnMapping || null;

  if (!detectedColumns && parser) {
    // Look for header row in first few rows
    for (let i = 0; i < Math.min(5, rawData.length); i++) {
      if (parser.isHeaderRow(rawData[i])) {
        headerRowIndex = i;
        detectedColumns = parser.detectColumns(rawData[i]);
        break;
      }
    }

    // If no header row found, try detecting from first data row
    if (!detectedColumns && rawData.length > 0) {
      detectedColumns = parser.detectColumns(rawData[0]);
    }
  }

  if (!detectedColumns) {
    return {
      rows: [],
      detectedColumns: null,
      headerRowIndex,
      rawData,
      totalCredits: 0,
      totalDebits: 0,
      dateRange: { start: null, end: null },
      errors: ['Could not detect column mapping. Please configure manually.'],
    };
  }

  // Process data rows
  const rows: ParsedRow[] = [];
  let totalCredits = 0;
  let totalDebits = 0;
  let minDate: Date | null = null;
  let maxDate: Date | null = null;
  const { transactionFilter = 'all' } = options;

  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i];

    // Skip header rows
    if (parser?.isHeaderRow(row)) {
      continue;
    }

    // Skip summary rows
    if (parser?.isSummaryRow(row)) {
      continue;
    }

    // Extract values using column mapping
    const dateValue = row[detectedColumns.date];
    const descriptionValue = row[detectedColumns.description];
    const creditValue = detectedColumns.credit ? row[detectedColumns.credit] : null;
    const debitValue = detectedColumns.debit ? row[detectedColumns.debit] : null;
    const referenceValue = detectedColumns.reference ? row[detectedColumns.reference] : null;

    // Parse values
    const transactionDate = parser?.parseDate(dateValue) ?? null;
    const description = descriptionValue ? String(descriptionValue).trim() : null;
    const creditAmount = parser?.parseAmount(creditValue) ?? null;
    const debitAmount = parser?.parseAmount(debitValue) ?? null;
    const reference = referenceValue ? String(referenceValue).trim() : null;

    // Skip rows with no meaningful data
    if (!transactionDate && !description && creditAmount === null && debitAmount === null) {
      continue;
    }

    // Determine transaction type and amount
    let transactionType: 'credit' | 'debit' | null = null;
    let amount: number | null = null;

    if (creditAmount !== null && creditAmount > 0) {
      transactionType = 'credit';
      amount = creditAmount;
      totalCredits += creditAmount;
    } else if (debitAmount !== null && debitAmount > 0) {
      transactionType = 'debit';
      amount = debitAmount;
      totalDebits += debitAmount;
    }

    // Apply transaction filter
    if (transactionFilter !== 'all') {
      if (transactionFilter === 'credit' && transactionType !== 'credit') {
        continue;
      }
      if (transactionFilter === 'debit' && transactionType !== 'debit') {
        continue;
      }
    }

    // Track date range
    if (transactionDate) {
      if (!minDate || transactionDate < minDate) {
        minDate = transactionDate;
      }
      if (!maxDate || transactionDate > maxDate) {
        maxDate = transactionDate;
      }
    }

    rows.push({
      row_number: i + 1, // 1-based row number
      raw_data: row,
      transaction_date: transactionDate,
      description,
      amount,
      transaction_type: transactionType,
      reference,
    });
  }

  return {
    rows,
    detectedColumns,
    headerRowIndex,
    rawData,
    totalCredits,
    totalDebits,
    dateRange: {
      start: minDate,
      end: maxDate,
    },
    errors,
  };
}

/**
 * Get column headers from CSV data
 */
export function getCSVHeaders(rawData: Record<string, unknown>[]): string[] {
  if (rawData.length === 0) {
    return [];
  }
  return Object.keys(rawData[0]);
}

/**
 * Validate column mapping against actual headers
 */
export function validateColumnMapping(
  mapping: ColumnMapping,
  headers: string[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const headerSet = new Set(headers);

  // Check required columns
  if (!mapping.date || !headerSet.has(mapping.date)) {
    errors.push(`Date column "${mapping.date}" not found in file`);
  }
  if (!mapping.description || !headerSet.has(mapping.description)) {
    errors.push(`Description column "${mapping.description}" not found in file`);
  }

  // At least one of credit/debit must be present
  const hasCredit = mapping.credit && headerSet.has(mapping.credit);
  const hasDebit = mapping.debit && headerSet.has(mapping.debit);
  if (!hasCredit && !hasDebit) {
    errors.push('At least one of Credit or Debit column must be mapped');
  }

  // Warn about optional columns
  if (mapping.reference && !headerSet.has(mapping.reference)) {
    errors.push(`Reference column "${mapping.reference}" not found (optional)`);
  }
  if (mapping.balance && !headerSet.has(mapping.balance)) {
    errors.push(`Balance column "${mapping.balance}" not found (optional)`);
  }

  return {
    valid: errors.filter((e) => !e.includes('optional')).length === 0,
    errors,
  };
}
