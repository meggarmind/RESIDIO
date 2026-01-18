/**
 * Standalone test script for First Bank PDF parsing logic.
 * This script validates:
 * 1. PDF decryption via qpdf
 * 2. Text extraction via pdfjs-dist
 * 3. Coordinate-based column detection (Deposit vs Withdrawal)
 */

import { parseFirstBankPdf } from '../../../src/lib/email-imports/parsers/first-bank-pdf';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

/**
 * Check if qpdf is installed on the system.
 */
function checkQpdfInstalled(): boolean {
    try {
        execSync('qpdf --version', { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

async function validatePdfParsing() {
    // Check for qpdf
    if (!checkQpdfInstalled()) {
        console.error('ERROR: qpdf is not installed. Please install it to run this test.');
        console.error('Hint: sudo apt-get install qpdf (Ubuntu/Debian) or brew install qpdf (macOS)');
        process.exit(1);
    }

    // Correct relative path from docs/api/api-tests/ to docs/legacydata/
    const samplePdfPath = path.resolve(__dirname, '../../legacydata/69_0212202545812579_1589769.pdf');
    const password = '73725';

    console.log(`Starting test for: ${samplePdfPath}`);

    if (!fs.existsSync(samplePdfPath)) {
        console.error(`ERROR: Sample PDF not found at ${samplePdfPath}`);
        process.exit(1);
    }

    const buffer = fs.readFileSync(samplePdfPath);

    try {
        const result = await parseFirstBankPdf(buffer, { password });

        if (result.error) {
            console.error(`Status: FAILED - ${result.error}`);
            process.exit(1);
        }

        console.log('Status: SUCCESS');
        console.log(`Transactions Found: ${result.transactions.length}`);

        let failures = 0;

        // Validate data shape and specific rows
        // 1. Check for a known credit/deposit row
        const depositTx = result.transactions.find(t => t.description && t.description.includes('IMAEKE KINGSLEY'));
        if (depositTx) {
            console.log('Validation: Deposit Row (Credit) -> FOUND');
            console.log(`  Row Details: ${depositTx.description} | ${depositTx.amount} | ${depositTx.transactionType}`);
            if (depositTx.transactionType !== 'credit') {
                console.error('  ERROR: Deposit row miscategorized as debit!');
                failures++;
            } else {
                console.log('  Result: CORRECT');
            }
        } else {
            console.warn('WARN: Could not find "IMAEKE KINGSLEY" in results.');
            failures++;
        }

        // 2. Check for a known debit/withdrawal row
        const debitTx = result.transactions.find(t => t.description && t.description.includes('Electronic Money Transfer Levy'));
        if (debitTx) {
            console.log('Validation: Withdrawal Row (Debit) -> FOUND');
            console.log(`  Row Details: ${debitTx.description} | ${debitTx.amount} | ${debitTx.transactionType}`);
            if (debitTx.transactionType !== 'debit') {
                console.error('  ERROR: Withdrawal row miscategorized as credit!');
                failures++;
            } else {
                console.log('  Result: CORRECT');
            }
        } else {
            console.warn('WARN: Could not find "Electronic Money Transfer Levy" in results.');
            failures++;
        }

        // 3. Check data sample
        console.log('\n--- Data Sample (First 3 rows) ---');
        console.log(JSON.stringify(result.transactions.slice(0, 3), null, 2));

        if (failures > 0) {
            console.error(`\nTest completed with ${failures} validation errors.`);
            process.exit(1);
        } else {
            console.log('\nAll validations passed.');
        }

    } catch (error) {
        console.error('Status: EXCEPTION');
        console.error(error);
        process.exit(1);
    }
}

// ESM-native main execution check
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('test_first_bank_pdf.ts')) {
    validatePdfParsing().catch(err => {
        console.error('Fatal Error:', err);
        process.exit(1);
    });
}
