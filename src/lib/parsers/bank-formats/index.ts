/**
 * Bank Format Registry
 *
 * Central registry for all supported bank statement formats.
 * Add new banks here as they are supported.
 */

import type { BankFormatConfig } from '@/types/database';
import {
  FIRSTBANK_CONFIG,
  detectFirstBankColumns,
  parseFirstBankAmount,
  parseFirstBankDate,
  isFirstBankHeaderRow,
  isFirstBankSummaryRow,
} from './firstbank';

// Registry of supported banks
export const BANK_FORMATS: Record<string, BankFormatConfig> = {
  firstbank: FIRSTBANK_CONFIG,
  // Add more banks as needed:
  // gtbank: GTBANK_CONFIG,
  // zenith: ZENITH_CONFIG,
  // access: ACCESS_CONFIG,
  // uba: UBA_CONFIG,
};

// Bank-specific parsers
export interface BankParser {
  config: BankFormatConfig;
  detectColumns: (headerRow: Record<string, unknown>) => ReturnType<typeof detectFirstBankColumns>;
  parseAmount: typeof parseFirstBankAmount;
  parseDate: typeof parseFirstBankDate;
  isHeaderRow: typeof isFirstBankHeaderRow;
  isSummaryRow: typeof isFirstBankSummaryRow;
}

export const BANK_PARSERS: Record<string, BankParser> = {
  firstbank: {
    config: FIRSTBANK_CONFIG,
    detectColumns: detectFirstBankColumns,
    parseAmount: parseFirstBankAmount,
    parseDate: parseFirstBankDate,
    isHeaderRow: isFirstBankHeaderRow,
    isSummaryRow: isFirstBankSummaryRow,
  },
};

/**
 * Get parser for a specific bank
 */
export function getBankParser(bankName: string): BankParser | null {
  const normalizedName = bankName.toLowerCase().replace(/\s+/g, '');
  return BANK_PARSERS[normalizedName] || null;
}

/**
 * Get list of supported banks
 */
export function getSupportedBanks(): Array<{ id: string; name: string }> {
  return Object.entries(BANK_FORMATS).map(([id, config]) => ({
    id,
    name: config.name,
  }));
}

/**
 * Auto-detect bank format from statement data
 * Currently returns FirstBank as default, can be enhanced to detect from data patterns
 */
export function detectBankFormat(data: Record<string, unknown>[]): string {
  // For now, default to FirstBank
  // In future, we can add detection logic based on:
  // - Column names
  // - Data patterns
  // - Header text
  return 'firstbank';
}

// Re-export FirstBank utilities for direct access
export {
  FIRSTBANK_CONFIG,
  FIRSTBANK_COLUMNS,
  FIRSTBANK_COLUMN_ALIASES,
  detectFirstBankColumns,
  parseFirstBankAmount,
  parseFirstBankDate,
  isFirstBankHeaderRow,
  isFirstBankSummaryRow,
} from './firstbank';
