/**
 * Client-side hashing utility for browser environment.
 * Uses Web Crypto API (crypto.subtle).
 */

/**
 * Generates a SHA-256 hash for an ArrayBuffer.
 */
export async function generateFileHashClient(buffer: ArrayBuffer): Promise<string> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}
