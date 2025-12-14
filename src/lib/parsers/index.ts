/**
 * Bank Statement Parsers
 *
 * Central export for all parsing utilities.
 */

// CSV Parser
export {
  parseCSVString,
  parseCSVFile,
  getCSVHeaders,
  validateColumnMapping,
  type CSVParseOptions,
  type CSVParseResult,
} from './csv-parser';

// XLSX Parser
export {
  parseXLSXBuffer,
  parseXLSXFile,
  getXLSXSheetNames,
  getXLSXHeaders,
  type XLSXParseOptions,
  type XLSXParseResult,
} from './xlsx-parser';

// Bank Formats
export {
  BANK_FORMATS,
  BANK_PARSERS,
  getBankParser,
  getSupportedBanks,
  detectBankFormat,
  // FirstBank specific
  FIRSTBANK_CONFIG,
  FIRSTBANK_COLUMNS,
  FIRSTBANK_COLUMN_ALIASES,
  detectFirstBankColumns,
  parseFirstBankAmount,
  parseFirstBankDate,
  isFirstBankHeaderRow,
  isFirstBankSummaryRow,
} from './bank-formats';

// Types
export type { BankParser } from './bank-formats';

/**
 * Parse a file (CSV or XLSX) based on file extension
 */
export async function parseStatementFile(
  file: File,
  options: {
    bankFormat?: string;
    transactionFilter?: 'credit' | 'debit' | 'all';
    sheetName?: string | number;
  } = {}
): Promise<CSVParseResult | XLSXParseResult> {
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith('.csv')) {
    const { parseCSVFile } = await import('./csv-parser');
    return parseCSVFile(file, options);
  }

  if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
    const { parseXLSXFile } = await import('./xlsx-parser');
    return parseXLSXFile(file, options);
  }

  // Default to CSV parsing for unknown types
  const { parseCSVFile } = await import('./csv-parser');
  return parseCSVFile(file, options);
}

import type { CSVParseResult } from './csv-parser';
import type { XLSXParseResult } from './xlsx-parser';

/**
 * Get file type from filename
 */
export function getFileType(fileName: string): 'csv' | 'xlsx' | 'unknown' {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith('.csv')) return 'csv';
  if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) return 'xlsx';
  return 'unknown';
}
