/**
 * General-Purpose Encryption Utilities
 *
 * Uses AES-256-GCM for encrypting sensitive data like bank PDF passwords.
 * 
 * Environment Variables (in order of priority):
 * 1. DATA_ENCRYPTION_KEY - Primary key for general data encryption
 * 2. GMAIL_TOKEN_ENCRYPTION_KEY - Fallback for backward compatibility
 *
 * Security Notes:
 * - AES-256-GCM provides authenticated encryption (confidentiality + integrity)
 * - Each encryption generates a unique IV (Initialization Vector)
 * - The IV is prepended to the ciphertext for storage
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Get the encryption key from environment variable.
 * Key must be 64 hex characters (32 bytes / 256 bits).
 * 
 * Priority:
 * 1. DATA_ENCRYPTION_KEY (preferred for general data)
 * 2. GMAIL_TOKEN_ENCRYPTION_KEY (backward compatibility)
 */
function getEncryptionKey(): Buffer {
    // Try primary key first
    let keyHex = process.env.DATA_ENCRYPTION_KEY;

    // Fall back to Gmail key for backward compatibility
    if (!keyHex) {
        keyHex = process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
    }

    if (!keyHex) {
        throw new Error(
            'DATA_ENCRYPTION_KEY environment variable is not set. ' +
            'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
        );
    }

    if (keyHex.length !== 64) {
        throw new Error('Encryption key must be 64 hex characters (256 bits)');
    }

    return Buffer.from(keyHex, 'hex');
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns base64-encoded string containing: IV + AuthTag + Ciphertext
 */
export function encrypt(plaintext: string): string {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
        authTagLength: AUTH_TAG_LENGTH,
    });

    const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    // Combine: IV (12 bytes) + AuthTag (16 bytes) + Ciphertext
    const combined = Buffer.concat([iv, authTag, encrypted]);

    return combined.toString('base64');
}

/**
 * Decrypt a base64-encoded ciphertext using AES-256-GCM.
 * Expects format: IV + AuthTag + Ciphertext
 */
export function decrypt(encryptedBase64: string): string {
    const key = getEncryptionKey();
    const combined = Buffer.from(encryptedBase64, 'base64');

    // Extract components
    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
        authTagLength: AUTH_TAG_LENGTH,
    });

    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
    ]);

    return decrypted.toString('utf8');
}

/**
 * Generate a new encryption key.
 * Use this to create the DATA_ENCRYPTION_KEY value.
 * This is a utility function, not used in production code.
 */
export function generateEncryptionKey(): string {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Validate that an encryption key is properly formatted.
 */
export function validateEncryptionKey(keyHex: string): boolean {
    if (keyHex.length !== 64) {
        return false;
    }

    // Check if it's valid hex
    return /^[0-9a-fA-F]{64}$/.test(keyHex);
}

/**
 * Check if encryption is properly configured.
 * Returns true if either DATA_ENCRYPTION_KEY or GMAIL_TOKEN_ENCRYPTION_KEY is set.
 */
export function isEncryptionConfigured(): boolean {
    const dataKey = process.env.DATA_ENCRYPTION_KEY;
    const gmailKey = process.env.GMAIL_TOKEN_ENCRYPTION_KEY;

    if (dataKey && validateEncryptionKey(dataKey)) {
        return true;
    }

    if (gmailKey && validateEncryptionKey(gmailKey)) {
        return true;
    }

    return false;
}
