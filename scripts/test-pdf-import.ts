/**
 * PDF Import Infrastructure Test CLI
 *
 * Tests the complete PDF import pipeline:
 * 1. PDF worker loading (pdfjs-dist)
 * 2. PDF text extraction
 * 3. Coordinate-based transaction parsing
 * 4. Full pipeline (buffer → parseFirstBankPdf)
 * 5. Error handling for edge cases
 *
 * Usage: npx tsx scripts/test-pdf-import.ts [path-to-pdf]
 */

import fs from 'fs';
import path from 'path';

// Polyfill DOMMatrix for Node.js
import DOMMatrix from '@thednp/dommatrix';
if (typeof globalThis.DOMMatrix === 'undefined') {
  // @ts-expect-error - Polyfilling global DOMMatrix for Node.js
  globalThis.DOMMatrix = DOMMatrix;
}

// ============================================================
// Test Utilities
// ============================================================

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  details?: string;
}

const results: TestResult[] = [];

async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  const start = performance.now();
  try {
    await fn();
    const duration = performance.now() - start;
    results.push({ name, passed: true, duration });
    console.log(`  ✅ ${name} (${duration.toFixed(0)}ms)`);
  } catch (error) {
    const duration = performance.now() - start;
    const message = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, duration, error: message });
    console.log(`  ❌ ${name} (${duration.toFixed(0)}ms)`);
    console.log(`     Error: ${message}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

// ============================================================
// Tests
// ============================================================

async function testWorkerLoading() {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  assert(pdfjsLib !== undefined, 'pdfjs-dist module not loaded');
  assert(typeof pdfjsLib.getDocument === 'function', 'getDocument not available');
  console.log('     pdfjs-dist version:', pdfjsLib.version || 'unknown');
}

async function testTextExtraction() {
  const { extractPdfText } = await import('@/lib/email-imports/parsers/first-bank-pdf');

  // Create a minimal valid PDF for testing
  const minimalPdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 44 >>
stream
BT /F1 12 Tf 100 700 Td (Test) Tj ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000360 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
435
%%EOF`;

  const buffer = Buffer.from(minimalPdf);
  const text = await extractPdfText(buffer);

  assert(typeof text === 'string', 'extractPdfText should return a string');
  console.log('     Extracted text length:', text.length);
}

async function testTransactionParsing() {
  const { parseTransactionsFromText } = await import('@/lib/email-imports/parsers/first-bank-pdf');

  // Simulate coordinate-tagged text from pdfjs-dist extraction
  // Format: [x,y]text
  const mockText = [
    '[50,700]01-JAN-26',
    '[150,700]TRANSFER FROM GTB',
    '[391,700]50,000.00',
    '[480,700]1,050,000.00',
    '[50,680]02-JAN-26',
    '[150,680]POS PURCHASE',
    '[436,680]5,000.00',
    '[480,680]1,045,000.00',
  ].join(' ');

  const transactions = parseTransactionsFromText(mockText);

  assert(Array.isArray(transactions), 'Should return an array');
  console.log('     Parsed transactions:', transactions.length);

  if (transactions.length > 0) {
    const first = transactions[0];
    console.log('     First transaction:', JSON.stringify({
      date: first.transactionDate,
      type: first.transactionType,
      amount: first.amount,
      description: first.description?.substring(0, 40),
    }, null, 0));
  }
}

async function testFullPipeline() {
  const { parseFirstBankPdf } = await import('@/lib/email-imports/parsers/first-bank-pdf');

  // Use the sample PDF if provided
  const samplePdfPath = process.argv[2];
  let pdfBuffer: Buffer;

  if (samplePdfPath && fs.existsSync(samplePdfPath)) {
    console.log(`     Using sample PDF: ${samplePdfPath}`);
    pdfBuffer = fs.readFileSync(samplePdfPath);
  } else {
    // Use the legacy data sample
    const legacyPdf = path.join(process.cwd(), 'docs/legacydata/69_0212202545812579_1589769.pdf');
    if (fs.existsSync(legacyPdf)) {
      console.log('     Using legacy sample PDF');
      pdfBuffer = fs.readFileSync(legacyPdf);
    } else {
      console.log('     Skipping (no sample PDF available)');
      return;
    }
  }

  console.log('     PDF size:', (pdfBuffer.length / 1024).toFixed(1), 'KB');

  const result = await parseFirstBankPdf(pdfBuffer);

  if (result.error) {
    console.log('     Parse error:', result.error);
    console.log('     Password required:', result.passwordRequired);
  } else {
    console.log('     Transactions found:', result.transactions.length);

    if (result.transactions.length > 0) {
      const credits = result.transactions.filter(t => t.transactionType === 'credit');
      const debits = result.transactions.filter(t => t.transactionType === 'debit');
      console.log('     Credits:', credits.length, '| Debits:', debits.length);

      // Show first 3 transactions
      result.transactions.slice(0, 3).forEach((tx, i) => {
        console.log(`     [${i + 1}] ${tx.transactionDate} | ${(tx.transactionType || 'unknown').toUpperCase()} | ₦${(tx.amount || 0).toLocaleString()} | ${tx.description?.substring(0, 50)}`);
      });
    }
  }
}

async function testEncryptedPdfHandling() {
  const { isPdfEncrypted } = await import('@/lib/email-imports/parsers/first-bank-pdf');

  // Test with a non-encrypted buffer
  const minimalPdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>
endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
trailer
<< /Size 4 /Root 1 0 R >>
startxref
190
%%EOF`;

  const buffer = Buffer.from(minimalPdf);
  const encrypted = await isPdfEncrypted(buffer);
  assert(encrypted === false, 'Minimal PDF should not be encrypted');
  console.log('     Encryption check passed');
}

async function testErrorHandling() {
  const { parseFirstBankPdf } = await import('@/lib/email-imports/parsers/first-bank-pdf');

  // Test with invalid buffer
  const invalidBuffer = Buffer.from('not a pdf');
  const result = await parseFirstBankPdf(invalidBuffer);

  assert(result.error !== null, 'Should return error for invalid PDF');
  console.log('     Invalid PDF handled:', result.error?.substring(0, 60));
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log('🔍 PDF Import Infrastructure Tests\n');

  console.log('1. Worker Loading');
  await runTest('pdfjs-dist loads correctly', testWorkerLoading);

  console.log('\n2. Text Extraction');
  await runTest('Extract text from minimal PDF', testTextExtraction);

  console.log('\n3. Transaction Parsing');
  await runTest('Parse transactions from coordinate text', testTransactionParsing);

  console.log('\n4. Error Handling');
  await runTest('Handle encrypted PDF detection', testEncryptedPdfHandling);
  await runTest('Handle invalid PDF gracefully', testErrorHandling);

  console.log('\n5. Full Pipeline');
  await runTest('Parse complete PDF statement', testFullPipeline);

  // Summary
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  console.log('\n' + '─'.repeat(50));
  console.log(`Results: ${passed} passed, ${failed} failed (${totalDuration.toFixed(0)}ms total)`);

  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
