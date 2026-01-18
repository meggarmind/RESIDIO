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

// Polyfill DOMMatrix for Node.js (required by pdfjs-dist used by pdf-parse)
// Must be imported before pdf-parse
import DOMMatrix from '@thednp/dommatrix';
if (typeof globalThis.DOMMatrix === 'undefined') {
  // @ts-expect-error - Polyfilling global DOMMatrix for Node.js
  globalThis.DOMMatrix = DOMMatrix;
}

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
 * Check if PDF is encrypted by attempting to load it
 */
export async function isPdfEncrypted(pdfBuffer: Buffer): Promise<boolean> {
  try {
    // Dynamic import to handle pdfjs-dist correctly in Node.js
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

    const data = new Uint8Array(pdfBuffer);
    // Use disableWorker for Node.js environment
    const loadingTask = pdfjsLib.getDocument({ data, disableWorker: true });

    await loadingTask.promise;
    return false; // Successfully loaded without password, not encrypted
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '';
    // Check if the error indicates password protection
    return errorMessage.toLowerCase().includes('password') ||
      errorMessage.toLowerCase().includes('encrypted') ||
      errorMessage.toLowerCase().includes('incorrect');
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
    // Dynamic import to handle pdfjs-dist correctly in Node.js
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

    const data = new Uint8Array(pdfBuffer);
    // Use disableWorker for Node.js environment
    const loadingTask = pdfjsLib.getDocument({ data, disableWorker: true });

    const pdfDoc = await loadingTask.promise;
    const pages: string[] = [];

    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => {
          if (!item.transform) return '';
          const x = Math.round(item.transform[4]);
          const y = Math.round(item.transform[5]);
          return `[${x},${y}]${item.str || ''}`;
        })
        .join(' ');
      pages.push(pageText);
    }

    return pages.join('\n');
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
 * First Bank statement format: DD-MMM-YY Reference Details DD-MMM-YY Deposit Withdrawal Balance
 * Text is space-separated columnar data from pdfjs-dist extraction.
 */
export function parseTransactionsFromText(text: string): ParsedEmailTransaction[] {
  const transactions: ParsedEmailTransaction[] = [];

  // First Bank PDF format with coordinates:
  // [X,Y]DD-MMM-YY   [X,Y]Reference/Details   [X,Y]DD-MMM-YY   [X,Y]Deposit/Withdrawal   [X,Y]Balance

  // Pattern to match Date, then skip items until the next Date, then find Amount and Balance
  // Format: [x,y]DD-MMM-YY ... [x,y]DD-MMM-YY ... [x,y]Amount ... [x,y]Balance
  // Note: Details can span multiple items/lines.

  // Using a more structured approach since we have coordinates
  // Regex bits:
  // Coord: \[\d+,\d+\]
  // Date: \d{2}-[A-Z]{3}-\d{2}
  // Amount: [\d,]+\.\d{2}

  const coordRegex = /\[(\d+),(\d+)\]/g;
  const datePattern = /\d{2}-[A-Z]{3}-\d{2}/;
  const amountPattern = /\d[\d,]*(?:\.\d{2})/;

  // Split the text into items with coordinates
  const items: { x: number, y: number, text: string }[] = [];
  let match;
  let lastIndex = 0;

  while ((match = coordRegex.exec(text)) !== null) {
    const x = parseInt(match[1]);
    const y = parseInt(match[2]);

    // Find where THIS item's text ends (next coordinate start or end of string)
    const textStart = match.index + match[0].length;
    let nextMatch = coordRegex.exec(text);
    let textEnd = nextMatch ? nextMatch.index : text.length;

    // Backtrack current regex pointer if we found nextMatch
    if (nextMatch) coordRegex.lastIndex = nextMatch.index;

    const itemText = text.substring(textStart, textEnd).trim();
    if (itemText || textStart === textEnd) {
      items.push({ x, y, text: itemText });
    }

    if (!nextMatch) break;
  }

  // Group items by Y coordinate into rows
  const rows = new Map<number, { x: number, y: number, text: string }[]>();
  items.forEach(item => {
    // Allow small Y difference (2-3 pixels) for the same row
    const normalizedY = Math.round(item.y / 2) * 2;
    if (!rows.has(normalizedY)) rows.set(normalizedY, []);
    rows.get(normalizedY)!.push(item);
  });

  // Sort rows by Y (from top to bottom, usually PDF Y is from bottom up)
  const sortedY = Array.from(rows.keys()).sort((a, b) => b - a);

  // Merge multi-line details and process rows
  for (let i = 0; i < sortedY.length; i++) {
    const y = sortedY[i];
    const rowItems = rows.get(y)!.sort((a, b) => a.x - b.x);
    const rowText = rowItems.map(item => item.text).join(' ');

    // Check if row starts with a date
    if (datePattern.test(rowItems[0]?.text)) {
      const transDateStr = rowItems[0].text;
      const date = parseFirstBankDate(transDateStr);
      if (!date) continue;

      // Find all amounts in the row and their X positions
      const amountItems = rowItems.filter(item => amountPattern.test(item.text));

      if (amountItems.length >= 2) {
        // Last one is usually balance, one before is amount
        const balanceItem = amountItems[amountItems.length - 1];
        const amountItem = amountItems[amountItems.length - 2];

        const amount = parseFirstBankAmount(amountItem.text);
        if (amount && amount > 0) {
          // Use X coordinate to determine type
          // Deposit column (~391), Withdrawal column (~436)
          // Threshold set at 410 based on analysis
          const transactionType = amountItem.x < 410 ? 'credit' : 'debit';

          // Assemble details (can span multiple rows, but start here)
          const details = rowItems
            .filter(item => item.x > 80 && item.x < 300)
            .map(item => item.text)
            .join(' ')
            .trim();

          transactions.push({
            transactionDate: date,
            description: cleanNarration(details),
            amount,
            transactionType,
            reference: extractReferenceFromNarration(details),
            bankAccountLast4: null,
          });
        }
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
