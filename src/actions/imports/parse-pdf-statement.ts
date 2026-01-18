'use server';

/**
 * PDF Statement Parser Server Action
 *
 * Parses password-protected PDF bank statements for the import wizard.
 * Reuses the existing First Bank PDF parser from email imports.
 */

import { parseFirstBankPdf, isPdfEncrypted } from '@/lib/email-imports/parsers/first-bank-pdf';
import { getDecryptedPassword } from '@/actions/email-imports/bank-passwords';

// ============================================================
// Types
// ============================================================

export interface ParsePdfResult {
    success: boolean;
    data?: {
        rawData: Record<string, unknown>[];
        headers: string[];
    };
    error?: string;
    passwordRequired?: boolean;
    usedSavedPassword?: boolean;
}

// ============================================================
// Server Action: Parse PDF Statement
// ============================================================

/**
 * Parse a PDF bank statement file.
 * 
 * @param formData - FormData containing the PDF file, optional password, and optional bankAccountId
 * @returns Parsed transaction data or error information
 */
export async function parsePdfStatement(formData: FormData): Promise<ParsePdfResult> {
    try {
        const file = formData.get('file') as File | null;
        let password = formData.get('password') as string | null;
        const bankAccountId = formData.get('bankAccountId') as string | null;

        if (!file) {
            return { success: false, error: 'No file provided' };
        }

        // Validate file type
        if (!file.name.toLowerCase().endsWith('.pdf')) {
            return { success: false, error: 'File must be a PDF' };
        }

        // Convert File to Buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Check if PDF is encrypted
        const encrypted = await isPdfEncrypted(buffer);

        // If encrypted and no password provided, try to get saved password
        let usedSavedPassword = false;
        if (encrypted && !password && bankAccountId) {
            const savedPassword = await getDecryptedPassword(bankAccountId);
            if (savedPassword.data) {
                password = savedPassword.data;
                usedSavedPassword = true;
            }
        }

        if (encrypted && !password) {
            return {
                success: false,
                error: 'This PDF is password-protected. Please enter the password.',
                passwordRequired: true,
            };
        }

        // Parse the PDF
        const result = await parseFirstBankPdf(buffer, {
            password: password || undefined,
        });

        if (result.error) {
            return {
                success: false,
                error: result.error,
                passwordRequired: result.passwordRequired,
            };
        }

        if (result.transactions.length === 0) {
            return {
                success: false,
                error: 'No transactions found in the PDF. Please check the file format.',
            };
        }

        // Convert ParsedEmailTransaction[] to the format expected by the import wizard
        // The wizard expects rawData as Record<string, unknown>[] with headers
        // Output separate Deposit and Withdrawal columns to match what ColumnMapper expects
        const rawData = result.transactions.map((tx, index) => ({
            row_number: index + 1,
            Date: tx.transactionDate,
            Description: tx.description,
            // Split amount into Deposit/Withdrawal based on transaction type
            Deposit: tx.transactionType === 'credit' ? tx.amount : 0,
            Withdrawal: tx.transactionType === 'debit' ? tx.amount : 0,
            Reference: tx.reference || '',
        }));

        // Define headers matching the ColumnMapper's expected columns
        // ColumnMapper expects: Date, Description, Withdrawal, Deposit, Reference
        const headers = ['Date', 'Description', 'Deposit', 'Withdrawal', 'Reference'];

        return {
            success: true,
            data: {
                rawData,
                headers,
            },
            usedSavedPassword,
        };
    } catch (error) {
        console.error('[parsePdfStatement] Error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to parse PDF',
        };
    }
}
