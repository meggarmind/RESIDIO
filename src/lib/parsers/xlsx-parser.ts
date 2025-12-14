/**
 * XLSX Parser
 *
 * Parses Excel files using SheetJS (xlsx) library.
 * Handles .xlsx and .xls formats.
 */

import * as XLSX from 'xlsx';
import type { ColumnMapping } from '@/types/database';
import type { ParsedRow } from '@/lib/validators/import';
import { getBankParser, detectBankFormat } from './bank-formats';

export interface XLSXParseOptions {
  /** Bank format to use (e.g., 'firstbank'). Auto-detects if not provided. */
  bankFormat?: string;
  /** Custom column mapping. Auto-detects if not provided. */
  columnMapping?: ColumnMapping;
  /** Filter transactions by type */
  transactionFilter?: 'credit' | 'debit' | 'all';
  /** Sheet name or index to parse (defaults to first sheet) */
  sheetName?: string | number;
  /** Skip header rows (auto-detected if not provided) */
  skipHeaderRows?: number;
}

export interface XLSXParseResult {
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
  sheetNames: string[];
  errors: string[];
}

/**
 * Parse XLSX file from ArrayBuffer
 */
export async function parseXLSXBuffer(
  buffer: ArrayBuffer,
  options: XLSXParseOptions = {}
): Promise<XLSXParseResult> {
  try {
    const workbook = XLSX.read(buffer, {
      type: 'array',
      cellDates: true,
      cellNF: true,
      cellText: true,
    });

    return processWorkbook(workbook, options);
  } catch (error) {
    return {
      rows: [],
      detectedColumns: null,
      headerRowIndex: 0,
      rawData: [],
      totalCredits: 0,
      totalDebits: 0,
      dateRange: { start: null, end: null },
      sheetNames: [],
      errors: [error instanceof Error ? error.message : 'Failed to parse Excel file'],
    };
  }
}

/**
 * Parse XLSX file from File object
 */
export async function parseXLSXFile(
  file: File,
  options: XLSXParseOptions = {}
): Promise<XLSXParseResult> {
  try {
    const buffer = await file.arrayBuffer();
    return parseXLSXBuffer(buffer, options);
  } catch (error) {
    return {
      rows: [],
      detectedColumns: null,
      headerRowIndex: 0,
      rawData: [],
      totalCredits: 0,
      totalDebits: 0,
      dateRange: { start: null, end: null },
      sheetNames: [],
      errors: [error instanceof Error ? error.message : 'Failed to read Excel file'],
    };
  }
}

/**
 * Process XLSX workbook
 */
function processWorkbook(
  workbook: XLSX.WorkBook,
  options: XLSXParseOptions
): XLSXParseResult {
  const errors: string[] = [];
  const sheetNames = workbook.SheetNames;

  if (sheetNames.length === 0) {
    return {
      rows: [],
      detectedColumns: null,
      headerRowIndex: 0,
      rawData: [],
      totalCredits: 0,
      totalDebits: 0,
      dateRange: { start: null, end: null },
      sheetNames: [],
      errors: ['No sheets found in workbook'],
    };
  }

  // Select sheet
  let sheetName: string;
  if (typeof options.sheetName === 'number') {
    if (options.sheetName >= sheetNames.length) {
      errors.push(`Sheet index ${options.sheetName} out of range`);
      sheetName = sheetNames[0];
    } else {
      sheetName = sheetNames[options.sheetName];
    }
  } else if (typeof options.sheetName === 'string') {
    if (!sheetNames.includes(options.sheetName)) {
      errors.push(`Sheet "${options.sheetName}" not found, using first sheet`);
      sheetName = sheetNames[0];
    } else {
      sheetName = options.sheetName;
    }
  } else {
    sheetName = sheetNames[0];
  }

  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    return {
      rows: [],
      detectedColumns: null,
      headerRowIndex: 0,
      rawData: [],
      totalCredits: 0,
      totalDebits: 0,
      dateRange: { start: null, end: null },
      sheetNames,
      errors: ['Failed to read worksheet'],
    };
  }

  // Convert to JSON with headers from first row
  const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    header: 1,
    raw: false,
    dateNF: 'yyyy-mm-dd',
  });

  // Find header row and convert to keyed objects
  const { headerIndex, headers, keyedData } = findHeadersAndConvertData(rawData);

  if (headers.length === 0 || keyedData.length === 0) {
    return {
      rows: [],
      detectedColumns: null,
      headerRowIndex: 0,
      rawData: [],
      totalCredits: 0,
      totalDebits: 0,
      dateRange: { start: null, end: null },
      sheetNames,
      errors: ['No data found in sheet'],
    };
  }

  // Process the keyed data
  return processParseResults(keyedData, headerIndex, sheetNames, options, errors);
}

/**
 * Find headers and convert array data to keyed objects
 */
function findHeadersAndConvertData(
  rawData: unknown[]
): {
  headerIndex: number;
  headers: string[];
  keyedData: Record<string, unknown>[];
} {
  // Look for a row that looks like headers (contains common banking terms)
  const headerTerms = ['date', 'narration', 'description', 'credit', 'debit', 'amount', 'balance', 'reference'];
  let headerIndex = 0;
  let headers: string[] = [];

  for (let i = 0; i < Math.min(10, rawData.length); i++) {
    const row = rawData[i];
    if (!Array.isArray(row)) continue;

    const rowStrings = row.map((cell) => String(cell || '').toLowerCase().trim());
    const matchCount = headerTerms.filter((term) =>
      rowStrings.some((cell) => cell.includes(term))
    ).length;

    if (matchCount >= 2) {
      headerIndex = i;
      headers = row.map((cell) => String(cell || '').trim());
      break;
    }
  }

  // If no headers found, use first row
  if (headers.length === 0 && rawData.length > 0) {
    const firstRow = rawData[0];
    if (Array.isArray(firstRow)) {
      headers = firstRow.map((cell, idx) => String(cell || `Column${idx + 1}`).trim());
    }
  }

  // Convert remaining rows to keyed objects
  const keyedData: Record<string, unknown>[] = [];
  for (let i = headerIndex + 1; i < rawData.length; i++) {
    const row = rawData[i];
    if (!Array.isArray(row)) continue;

    // Skip empty rows
    if (row.every((cell) => cell === null || cell === undefined || cell === '')) {
      continue;
    }

    const obj: Record<string, unknown> = {};
    for (let j = 0; j < headers.length; j++) {
      if (headers[j]) {
        obj[headers[j]] = row[j];
      }
    }
    keyedData.push(obj);
  }

  return { headerIndex, headers, keyedData };
}

/**
 * Process parsed results into standardized format
 */
function processParseResults(
  rawData: Record<string, unknown>[],
  headerRowIndex: number,
  sheetNames: string[],
  options: XLSXParseOptions,
  existingErrors: string[]
): XLSXParseResult {
  const errors = [...existingErrors];

  if (rawData.length === 0) {
    return {
      rows: [],
      detectedColumns: null,
      headerRowIndex,
      rawData: [],
      totalCredits: 0,
      totalDebits: 0,
      dateRange: { start: null, end: null },
      sheetNames,
      errors: ['No data found in file'],
    };
  }

  // Detect or use provided bank format
  const bankFormat = options.bankFormat || detectBankFormat(rawData);
  const parser = getBankParser(bankFormat);

  if (!parser) {
    errors.push(`Unknown bank format: ${bankFormat}`);
  }

  // Detect columns
  let detectedColumns: ColumnMapping | null = options.columnMapping || null;

  if (!detectedColumns && parser) {
    // Try detecting from first data row
    if (rawData.length > 0) {
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
      sheetNames,
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
    const transactionDate = parser?.parseDate(dateValue) ?? parseExcelDate(dateValue);
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
      row_number: headerRowIndex + i + 2, // Account for header offset, 1-based
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
    sheetNames,
    errors,
  };
}

/**
 * Parse Excel serial date to JavaScript Date
 */
function parseExcelDate(value: unknown): Date | null {
  if (value === null || value === undefined) {
    return null;
  }

  // If already a Date
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  // If a number (Excel serial date)
  if (typeof value === 'number') {
    // Excel dates are days since 1900-01-01 (with a bug for 1900 leap year)
    const excelEpoch = new Date(1899, 11, 30);
    const msPerDay = 24 * 60 * 60 * 1000;
    const date = new Date(excelEpoch.getTime() + value * msPerDay);
    return isNaN(date.getTime()) ? null : date;
  }

  // If a string, try parsing
  if (typeof value === 'string') {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }

  return null;
}

/**
 * Get sheet names from workbook
 */
export async function getXLSXSheetNames(file: File): Promise<string[]> {
  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    return workbook.SheetNames;
  } catch {
    return [];
  }
}

/**
 * Get column headers from XLSX data
 */
export function getXLSXHeaders(rawData: Record<string, unknown>[]): string[] {
  if (rawData.length === 0) {
    return [];
  }
  return Object.keys(rawData[0]);
}
