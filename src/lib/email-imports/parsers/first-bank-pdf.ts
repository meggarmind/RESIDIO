/**
 * First Bank PDF Statement Parser
 *
 * Parses PDF bank statements from First Bank Nigeria.
 * Handles password-protected PDFs using stored passwords.
 *
 * PDF Statement Structure (typical):
 * - Header: Account name, number, statement period
 * - Table columns: Date, Narration, Reference, Debit, Credit, Balance
 * - Transactions: One row per transaction
 * - Footer: Summary totals
 */

import type { ParsedEmailTransaction } from '@/types/database';
import { parseFirstBankAmount, parseFirstBankDate } from '@/lib/parsers/bank-formats/firstbank';
import { getPasswordByAccountLast4 } from '@/actions/email-imports/bank-passwords';

// ============================================================
// PDF Decryption
// ============================================================

/**
 * Attempt to decrypt a password-protected PDF.
 * Uses qpdf CLI tool for decryption (more reliable than pdf-lib).
 *
 * Note: pdf-lib has limited support for encrypted PDFs.
 * qpdf is used as the primary decryption method.
 *
 * Install qpdf: sudo apt-get install qpdf (Ubuntu/Debian)
 */
export async function decryptPdf(
  pdfBuffer: Buffer,
  password: string
): Promise<Buffer> {
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const { writeFileSync, readFileSync, unlinkSync } = await import('fs');
  const { tmpdir } = await import('os');
  const { join } = await import('path');
  const { randomUUID } = await import('crypto');

  const execFileAsync = promisify(execFile);
  const tempId = randomUUID();
  const inputPath = join(tmpdir(), `encrypted-${tempId}.pdf`);
  const outputPath = join(tmpdir(), `decrypted-${tempId}.pdf`);

  try {
    // Write encrypted PDF to temp file
    writeFileSync(inputPath, pdfBuffer);

    // Use qpdf to decrypt with execFile (safe from shell injection)
    // qpdf --decrypt --password=<password> input.pdf output.pdf
    await execFileAsync('qpdf', [
      '--decrypt',
      `--password=${password}`,
      inputPath,
      outputPath,
    ]);

    // Read decrypted PDF
    const decryptedBuffer = readFileSync(outputPath);

    return decryptedBuffer;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    // Check if qpdf is not installed
    if (message.includes('ENOENT') || message.includes('not found')) {
      throw new Error('qpdf is not installed. Please install it: sudo apt-get install qpdf');
    }

    // Check for wrong password
    if (message.includes('invalid password') || message.includes('password')) {
      throw new Error('Invalid PDF password');
    }

    throw new Error(`Failed to decrypt PDF: ${message}`);
  } finally {
    // Clean up temp files
    try {
      unlinkSync(inputPath);
    } catch {
      // Ignore cleanup errors
    }
    try {
      unlinkSync(outputPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Check if PDF is encrypted using pdf-parse
 */
export async function isPdfEncrypted(pdfBuffer: Buffer): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse');
    // Try to parse - if it fails with encryption error, PDF is encrypted
    await pdfParse(pdfBuffer);
    return false;
  } catch (error) {
    // Check if the error is about encryption
    const errorMessage = error instanceof Error ? error.message : '';
    return errorMessage.toLowerCase().includes('encrypted') ||
           errorMessage.toLowerCase().includes('password') ||
           errorMessage.toLowerCase().includes('secure');
  }
}

// ============================================================
// PDF Text Extraction
// ============================================================

/**
 * Extract text content from PDF buffer
 */
export async function extractPdfText(pdfBuffer: Buffer): Promise<string> {
  try {
    // Use require for pdf-parse (CommonJS package with ESM compatibility issues)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(pdfBuffer);
    return data.text;
  } catch (error) {
    throw new Error(
      `Failed to extract PDF text: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// ============================================================
// Transaction Parsing
// ============================================================

/**
 * Parse transactions from extracted PDF text.
 * First Bank statement format has transactions in a table structure.
 */
export function parseTransactionsFromText(text: string): ParsedEmailTransaction[] {
  const transactions: ParsedEmailTransaction[] = [];
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

  // Transaction line pattern (flexible for various formats)
  // Typical: DATE | NARRATION | REFERENCE | DEBIT | CREDIT | BALANCE
  const transactionPattern = /^(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})\s+(.+?)\s+([\d,]+\.?\d*)\s*$/;

  // More complex pattern for full row
  const fullRowPattern =
    /(\d{1,2}[/\-][A-Za-z]{3}[/\-]\d{4}|\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})\s+(.+?)\s+(?:(\d[\d,]*\.?\d*)\s+)?(?:(\d[\d,]*\.?\d*)\s+)?(\d[\d,]*\.?\d*)$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip header/summary lines
    if (isHeaderOrSummaryLine(line)) continue;

    // Try to match transaction pattern
    const fullMatch = line.match(fullRowPattern);
    if (fullMatch) {
      const [, dateStr, narration, amount1, amount2, balance] = fullMatch;

      const date = parseFirstBankDate(dateStr);
      if (!date) continue;

      // Determine if credit or debit based on position
      // If only one amount before balance, check context
      let amount: number | null = null;
      let transactionType: 'credit' | 'debit' = 'credit';

      if (amount1 && amount2) {
        // Both debit and credit columns present
        const debit = parseFirstBankAmount(amount1);
        const credit = parseFirstBankAmount(amount2);

        if (credit && credit > 0) {
          amount = credit;
          transactionType = 'credit';
        } else if (debit && debit > 0) {
          amount = debit;
          transactionType = 'debit';
        }
      } else if (amount1) {
        // Single amount - determine type from narration keywords
        amount = parseFirstBankAmount(amount1);
        transactionType = determineTransactionType(narration);
      }

      if (amount && amount > 0) {
        transactions.push({
          transactionDate: date,
          description: cleanNarration(narration),
          amount,
          transactionType,
          reference: extractReferenceFromNarration(narration),
          bankAccountLast4: null, // Will be set from PDF metadata if available
        });
      }

      continue;
    }

    // Try simpler pattern (date + description + amount)
    const simpleMatch = line.match(transactionPattern);
    if (simpleMatch) {
      const [, dateStr, narration, amountStr] = simpleMatch;

      const date = parseFirstBankDate(dateStr);
      const amount = parseFirstBankAmount(amountStr);

      if (date && amount && amount > 0) {
        transactions.push({
          transactionDate: date,
          description: cleanNarration(narration),
          amount,
          transactionType: determineTransactionType(narration),
          reference: extractReferenceFromNarration(narration),
          bankAccountLast4: null,
        });
      }
    }
  }

  return transactions;
}

/**
 * Check if line is a header or summary line (should be skipped)
 */
function isHeaderOrSummaryLine(line: string): boolean {
  const lower = line.toLowerCase();
  const skipPatterns = [
    'transaction date',
    'narration',
    'reference',
    'debit',
    'credit',
    'balance',
    'opening balance',
    'closing balance',
    'total',
    'page',
    'account name',
    'account number',
    'statement',
    'period',
    'branch',
    'first bank',
  ];

  return skipPatterns.some((pattern) => lower.includes(pattern));
}

/**
 * Determine transaction type from narration text
 */
function determineTransactionType(narration: string): 'credit' | 'debit' {
  const lower = narration.toLowerCase();

  // Credit indicators
  const creditPatterns = [
    'credit',
    'cr',
    'deposit',
    'inward',
    'received',
    'transfer from',
    'trf from',
    'salary',
    'pay in',
    'reversal',
  ];

  // Debit indicators
  const debitPatterns = [
    'debit',
    'dr',
    'withdrawal',
    'outward',
    'transfer to',
    'trf to',
    'pos',
    'atm',
    'charge',
    'fee',
    'bill',
    'payment to',
  ];

  if (creditPatterns.some((p) => lower.includes(p))) {
    return 'credit';
  }

  if (debitPatterns.some((p) => lower.includes(p))) {
    return 'debit';
  }

  // Default to credit (safer for payment matching)
  return 'credit';
}

/**
 * Clean up narration text
 */
function cleanNarration(narration: string): string {
  return narration
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s/\-\.]/g, '')
    .trim();
}

/**
 * Extract reference from narration if present
 */
function extractReferenceFromNarration(narration: string): string | null {
  const patterns = [
    /ref[:\s]*([A-Z0-9/\-]+)/i,
    /trf[:/]?\s*([A-Z0-9]+)/i,
    /([A-Z]{2,}\d+[A-Z0-9]*)/,
  ];

  for (const pattern of patterns) {
    const match = narration.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
}

// ============================================================
// Main Parser Function
// ============================================================

/**
 * Parse a First Bank PDF statement.
 * Handles password-protected PDFs automatically.
 */
export async function parseFirstBankPdf(
  pdfBuffer: Buffer,
  options?: {
    password?: string;
    accountLast4?: string;
  }
): Promise<{
  transactions: ParsedEmailTransaction[];
  error: string | null;
  passwordRequired: boolean;
}> {
  try {
    let workingBuffer = pdfBuffer;

    // Check if encrypted
    const encrypted = await isPdfEncrypted(pdfBuffer);

    if (encrypted) {
      let password = options?.password;

      // Try to get password from database if account number provided
      if (!password && options?.accountLast4) {
        const { data: storedPassword } = await getPasswordByAccountLast4(
          options.accountLast4
        );
        if (storedPassword) {
          password = storedPassword;
        }
      }

      if (!password) {
        return {
          transactions: [],
          error: 'PDF is password-protected. Please configure the password in settings.',
          passwordRequired: true,
        };
      }

      try {
        workingBuffer = await decryptPdf(pdfBuffer, password);
      } catch (decryptError) {
        return {
          transactions: [],
          error: `Failed to decrypt PDF: ${decryptError instanceof Error ? decryptError.message : 'Invalid password'}`,
          passwordRequired: true,
        };
      }
    }

    // Extract text from PDF
    const text = await extractPdfText(workingBuffer);

    if (!text || text.trim().length === 0) {
      return {
        transactions: [],
        error: 'Could not extract text from PDF',
        passwordRequired: false,
      };
    }

    // Parse transactions from text
    const transactions = parseTransactionsFromText(text);

    // Set account number on all transactions if provided
    if (options?.accountLast4) {
      for (const tx of transactions) {
        tx.bankAccountLast4 = options.accountLast4;
      }
    }

    return {
      transactions,
      error: null,
      passwordRequired: false,
    };
  } catch (error) {
    return {
      transactions: [],
      error: error instanceof Error ? error.message : 'Failed to parse PDF',
      passwordRequired: false,
    };
  }
}

/**
 * Extract account number from PDF text
 */
export function extractAccountNumber(text: string): string | null {
  // Pattern: Account Number: 0123456789 or A/C No: 0123456789
  const patterns = [
    /account\s*(?:number|no\.?)[:\s]*(\d{10})/i,
    /a\/c\s*no\.?[:\s]*(\d{10})/i,
    /\*{3,4}(\d{4})/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      // Return last 4 digits
      const num = match[1];
      return num.length > 4 ? num.slice(-4) : num;
    }
  }

  return null;
}
