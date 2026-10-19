/**
 * Utility functions for email import processing
 */

// Common Nigerian bank prefixes and transaction codes to strip
const BANK_PREFIXES = [
    // Mobile banking prefixes
    'FBNMOBILE', 'GTBMOBILE', 'ZENITHMOBILE', 'UBAMOBILE', 'ACCESSMOBILE',
    'FBN', 'GTB', 'ZENITH', 'UBA', 'ACCESS', 'FCMB', 'STANBIC', 'STERLING',
    'FIDELITY', 'FIRST', 'UNION', 'WEMA', 'POLARIS', 'KEYSTONE', 'ECOBANK',
    // Transaction type prefixes
    'NIP', 'WTRNS', 'WEB', 'MOBILE', 'USSD', 'POS', 'ATM', 'TRANSFER',
    // Common patterns
    'FIPPBL', 'FIPPR', 'NIBSS', 'PAYSTACK', 'FLUTTERWAVE', 'INTERSWITCH',
];

/**
 * Convert ALL CAPS or mixed case to Title Case
 */
function toTitleCase(str: string): string {
    return str
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

/**
 * Extract potential sender name from bank description
 * Handles various Nigerian bank description formats including:
 * - FBNMOBILEISIMAH NKECHI/Nk
 * - FIPPBL/CHUKWUEMEKA
 * - 800271 VICTOR ADJEI
 * - FIPPR000013/OLOWE OLUWASEUN
 */
export function extractSenderName(description: string): string | null {
    if (!description || typeof description !== 'string') {
        return null;
    }

    let cleaned = description.trim();

    // Step 1: Handle slash-separated formats (e.g., FIPPBL/CHUKWUEMEKA)
    // The part after the slash often contains the actual name
    if (cleaned.includes('/')) {
        const parts = cleaned.split('/');
        // Try each part, preferring the one that looks most like a name
        for (const part of parts) {
            const trimmedPart = part.trim();
            // Skip if it's just a bank prefix or transaction code
            const isPrefix = BANK_PREFIXES.some(prefix =>
                trimmedPart.toUpperCase().startsWith(prefix)
            );
            // Skip if it's mostly numbers or too short
            const hasEnoughLetters = (trimmedPart.match(/[a-zA-Z]/g) || []).length >= 3;
            const isNotJustNumber = !/^\d+$/.test(trimmedPart);

            if (!isPrefix && hasEnoughLetters && isNotJustNumber && trimmedPart.length >= 3) {
                cleaned = trimmedPart;
                break;
            }
        }
    }

    // Step 2: Remove bank prefixes (like FBNMOBILE from FBNMOBILEISIMAH)
    const workingStr = cleaned.toUpperCase();
    for (const prefix of BANK_PREFIXES) {
        if (workingStr.startsWith(prefix)) {
            // Remove the prefix
            cleaned = cleaned.substring(prefix.length);
            break;
        }
    }

    // Step 3: Remove leading/trailing transaction codes and numbers
    cleaned = cleaned
        .replace(/^[\d\s/-]+/, '') // Remove leading numbers, spaces, slashes, dashes
        .replace(/[\d\s/-]+$/, '') // Remove trailing numbers, spaces, slashes, dashes
        .replace(/\s*\/\s*[A-Za-z]{1,3}$/, '') // Remove short suffixes like /Nk, /TF
        .trim();

    // Step 4: Handle embedded names in formats like "ISIMAH NKECHI"
    // Split by spaces and filter for alphabetic words
    const words = cleaned.split(/\s+/).filter(w => {
        // Keep words that are mostly alphabetic and at least 2 chars
        const letters = (w.match(/[a-zA-Z]/g) || []).length;
        return letters >= 2 && letters / w.length > 0.5;
    });

    // Step 5: Try to find a proper name pattern
    // First, check for Title Case pattern (e.g., "John Smith")
    const titleCaseMatch = cleaned.match(/([A-Z][a-z]+\s+){1,3}[A-Z][a-z]+/);
    if (titleCaseMatch) {
        return titleCaseMatch[0].trim();
    }

    // Step 6: If we have ALL CAPS words that look like names, convert to Title Case
    if (words.length >= 1) {
        // Take first 3 words maximum
        const nameWords = words.slice(0, 3);
        const potentialName = nameWords.join(' ');

        // Verify it looks like a name (all alphabetic)
        if (/^[A-Za-z\s]+$/.test(potentialName)) {
            return toTitleCase(potentialName);
        }

        // If mixed with some non-alpha chars, try to clean up
        const cleanedWords = nameWords.map(w => w.replace(/[^a-zA-Z]/g, '')).filter(w => w.length >= 2);
        if (cleanedWords.length >= 1) {
            return toTitleCase(cleanedWords.join(' '));
        }
    }

    // Step 7: Last resort - if cleaned string has at least 3 letters, use it
    const lettersOnly = cleaned.replace(/[^a-zA-Z\s]/g, '').trim();
    if (lettersOnly.length >= 3) {
        const finalWords = lettersOnly.split(/\s+/).filter(w => w.length >= 2).slice(0, 3);
        if (finalWords.length >= 1) {
            return toTitleCase(finalWords.join(' '));
        }
    }

    return null;
}

export interface EmailImportCounts {
    transactions_extracted?: number | null;
    transactions_matched?: number | null;
    transactions_auto_processed?: number | null;
    transactions_queued?: number | null;
    transactions_skipped?: number | null;
    transactions_errored?: number | null;
}

/**
 * Imported transactions the matcher could not match to anything. Clamped at 0
 * because the counters are written at different stages. Manual processing is
 * not represented in the import-level counters, so it cannot be excluded here.
 */
export function getUnmatchedCount(counts: EmailImportCounts): number {
    const extracted = counts.transactions_extracted ?? 0;
    const matched = counts.transactions_matched ?? 0;
    return Math.max(0, extracted - matched);
}

/**
 * Email credits strictly above this amount (naira, as stored in
 * email_transactions.amount) are never auto-processed and need an approver
 * to release them (owner decision #668 Q5, #709). Debits are not limited.
 * The live value is the `email_import_auto_process_limit` setting (#710); this
 * is the default used when that row is absent.
 */
export const EMAIL_AUTO_PROCESS_LIMIT_NGN = 60000;

export const EMAIL_AUTO_PROCESS_LIMIT_KEY = 'email_import_auto_process_limit';

/** Upper bound for the setting; anything higher would switch the control off. */
export const EMAIL_AUTO_PROCESS_LIMIT_MAX = 100_000_000;

/** A usable limit: whole naira, from 1 to EMAIL_AUTO_PROCESS_LIMIT_MAX. */
export function isValidEmailAutoProcessLimit(value: unknown): value is number {
    return (
        typeof value === 'number' &&
        Number.isInteger(value) &&
        value > 0 &&
        value <= EMAIL_AUTO_PROCESS_LIMIT_MAX
    );
}

/**
 * Whether a transaction is above the limit and would become a payment. Anything
 * that is not a debit takes the payment path when released, so it counts.
 * A `null` limit means the setting could not be read: every credit counts as
 * over it (fail closed, #710).
 */
export function exceedsEmailAutoProcessLimit(
    tx: {
        transaction_type: string | null;
        amount: number | string | null;
    },
    limit: number | null = EMAIL_AUTO_PROCESS_LIMIT_NGN
): boolean {
    if (tx.transaction_type === 'debit') return false;
    return limit === null || Number(tx.amount) > limit;
}

/** The review-queue label for an over-limit credit. */
export function emailOverLimitLabel(limit: number | null): string {
    return limit === null
        ? 'Needs approval: approval limit unavailable'
        : `Needs approval: over ₦${limit.toLocaleString('en-NG')}`;
}
