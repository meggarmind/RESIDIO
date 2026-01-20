import crypto from 'crypto';

/**
 * Normalizes a description string for consistent hashing.
 * Trims whitespace and converts to lowercase.
 */
export function normalizeDescription(description: string): string {
    return description.trim().toLowerCase();
}

/**
 * Generates a SHA-256 hash for a transaction.
 * Sources: Date + Abs(Amount) + Normalized Description + Reference (if available)
 */
export function generateTransactionHash(params: {
    date: string | Date;
    amount: number;
    description: string;
    reference?: string | null;
}): string {
    const { date, amount, description, reference } = params;

    // Date normalization: use YYYY-MM-DD format
    const dateStr = date instanceof Date ? date.toISOString().split('T')[0] : date;

    // Amount normalization: use absolute value to handle reversed debits/credits
    const absAmount = Math.abs(amount).toFixed(2);

    // Description normalization
    const normDesc = normalizeDescription(description);

    // Reference normalization
    const normRef = reference ? reference.trim() : '';

    // Combine components
    const source = `${dateStr}|${absAmount}|${normDesc}|${normRef}`;

    return crypto.createHash('sha256').update(source).digest('hex');
}

/**
 * Generates a SHA-256 hash for a file.
 * Used to detect identical files even if renamed.
 */
export function generateFileHash(fileBuffer: Buffer | ArrayBuffer): string {
    const buffer = fileBuffer instanceof ArrayBuffer ? Buffer.from(fileBuffer) : fileBuffer;
    return crypto.createHash('sha256').update(buffer).digest('hex');
}
