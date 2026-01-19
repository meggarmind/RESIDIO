
import fs from 'fs';
import path from 'path';
import { parseFirstBankAlert } from '@/lib/email-imports/parsers/first-bank-alert';
import { parseFirstBankPdf } from '@/lib/email-imports/parsers/first-bank-pdf';

async function main() {
    console.log('Starting Email Import Evaluation...\n');

    const docsDir = path.join(process.cwd(), 'docs/features/Email-import');

    // ==========================================
    // 1. Evaluate Alert Email
    // ==========================================
    console.log('--- Evaluating Alert Email ---');
    const alertEmlPath = path.join(docsDir, 'FirstBank Alert on Your Account - Credit.eml');

    try {
        const alertContent = fs.readFileSync(alertEmlPath, 'utf-8');

        // Simple extraction of the plain text body for testing
        // In a real scenario, an email parser (like mailparser) would do this.
        // We'll extract the text between the boundaries for the text/plain part.
        // Based on the file view, the text/plain part is relatively clear.

        // Hacky extraction for demonstration: find the content after "Content-Type: text/plain"
        // and before the next boundary.
        const plainTextMatch = alertContent.match(/Content-Type: text\/plain[\s\S]*?\n\n([\s\S]*?)(?:--_)/);

        let bodyToTest = '';
        if (plainTextMatch && plainTextMatch[1]) {
            bodyToTest = plainTextMatch[1];
            console.log('Extracted Body (truncated):', bodyToTest.substring(0, 100).replace(/\n/g, ' ') + '...');
        } else {
            // Fallback: manually construct the body as seen in the file viewer for reliability if regex fails
            // because EML parsing with regex is brittle.
            console.log('Warning: Could not auto-extract body, using manual sample from file view.');
            bodyToTest = `
        Transaction Details
        Date/Time
        12-Jan-26 03:40 PM
        Account Number
        202XXXX725
        Amount
        15,000.00 CR
        Narration
        FIP:GTB/ANIH LANA/NIP Transfer to OLIVE PARK ESTA
        Cleared Balance
        NGN7,061,617.47 CR
        `;
        }

        const alertResult = parseFirstBankAlert(bodyToTest, 'FirstBank Alert on Your Account - Credit');

        if (alertResult) {
            console.log('✅ Alert Parsed Successfully:');
            console.log(JSON.stringify(alertResult, null, 2));
        } else {
            console.log('❌ Alert Parsing Failed. The parser returned null.');
            console.log('Body used:', bodyToTest);
        }

    } catch (error) {
        console.error('Error processing alert email:', error);
    }

    // ==========================================
    // 2. Evaluate Statement Email (PDF)
    // ==========================================
    console.log('\n--- Evaluating Statement Email ---');
    const statementEmlPath = path.join(docsDir, 'E-Statement of November - 2025 for Account no 20204XXXXX.eml');

    try {
        const statementContent = fs.readFileSync(statementEmlPath, 'utf-8');

        // Extract base64 PDF
        // Look for Content-Disposition: attachment; filename="...pdf" or similar
        // The previous regex was too strict. EML attachments often start with Content-Type or Content-Disposition
        // and are separated by blank lines. Base64 blocks are large contiguous blocks.

        // Strategy: Find a line saying "Content-Disposition: attachment; filename=...pdf"
        // Then find the next blank line, then capture everything until the next boundary (line starting with --)

        const attachmentRegex = /Content-Disposition: attachment; filename=".*?\.pdf"[\s\S]*?\n\n([\s\S]*?)(?=\n--)/i;
        const pdfMatch = statementContent.match(attachmentRegex);

        if (pdfMatch && pdfMatch[1]) {
            const base64Data = pdfMatch[1].replace(/\n/g, '').replace(/\r/g, '').replace(/\s/g, ''); // Aggressively clean
            const pdfBuffer = Buffer.from(base64Data, 'base64');

            console.log(`Extracted PDF Buffer: ${pdfBuffer.length} bytes`);

            const password = '73725';
            console.log(`Attempting to parse PDF with password: ${password}`);

            const pdfResult = await parseFirstBankPdf(pdfBuffer, { password });

            if (pdfResult.error) {
                console.log('❌ PDF Parsing Failed:', pdfResult.error);
                if (pdfResult.passwordRequired) {
                    console.log('Password was required.');
                }
            } else {
                console.log(`✅ PDF Parsed Successfully. Found ${pdfResult.transactions.length} transactions.`);
                if (pdfResult.transactions.length > 0) {
                    console.log('First Transaction:', JSON.stringify(pdfResult.transactions[0], null, 2));
                }
            }

        } else {
            // Check if there is a legacy PDF file provided directly
            const legacyPdfPath = path.join(process.cwd(), 'docs/legacydata/69_0212202545812579_1589769.pdf');
            if (fs.existsSync(legacyPdfPath)) {
                console.log('Using legacy PDF file directly as fallback extraction failed.');
                const pdfBuffer = fs.readFileSync(legacyPdfPath);
                const password = '73725';
                const pdfResult = await parseFirstBankPdf(pdfBuffer, { password });

                if (pdfResult.error) {
                    console.log('❌ PDF Parsing Failed:', pdfResult.error);
                } else {
                    console.log(`✅ PDF Parsed Successfully. Found ${pdfResult.transactions.length} transactions.`);
                    if (pdfResult.transactions.length > 0) {
                        console.log('First Transaction:', JSON.stringify(pdfResult.transactions[0], null, 2));
                    }
                }
            } else {
                console.error('❌ Could not extract PDF from EML and no legacy PDF found.');
            }
        }

    } catch (error) {
        console.error('Error processing statement email:', error);
    }
}

main().catch(console.error);
