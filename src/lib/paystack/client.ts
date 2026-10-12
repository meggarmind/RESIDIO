/**
 * Paystack Payment Gateway Client
 *
 * Client for interacting with Paystack API
 * Documentation: https://paystack.com/docs/api/
 */

import type {
  PaystackInitializeRequest,
  PaystackInitializeResponse,
  PaystackVerifyResponse,
  PaystackErrorResponse,
} from './types';

// Paystack API configuration
export const paystackConfig = {
  secretKey: process.env.PAYSTACK_SECRET_KEY || '',
  publicKey: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || '',
  baseUrl: 'https://api.paystack.co',
  webhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET || '',
};

/**
 * Check if Paystack is properly configured
 */
export function isPaystackConfigured(): boolean {
  return !!process.env.PAYSTACK_SECRET_KEY;
}

/**
 * Check if Paystack public key is available (for client-side)
 */
export function isPaystackPublicKeyAvailable(): boolean {
  return !!process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;
}

/**
 * Generate a unique transaction reference
 * Format: RSO-{timestamp}-{random}
 */
export function generateReference(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `RSO-${timestamp}-${random}`;
}

/**
 * Convert Naira to Kobo (smallest currency unit)
 */
export function nairaToKobo(amountNaira: number): number {
  // Round to 2 decimal places first to avoid floating point issues
  const rounded = Math.round(amountNaira * 100) / 100;
  return Math.round(rounded * 100);
}

/**
 * Convert Kobo to Naira
 */
export function koboToNaira(amountKobo: number): number {
  return amountKobo / 100;
}

/**
 * Initialize a transaction with Paystack
 */
export async function initializeTransaction(
  data: PaystackInitializeRequest
): Promise<PaystackInitializeResponse | PaystackErrorResponse> {
  if (!isPaystackConfigured()) {
    return {
      status: false,
      message: 'Paystack is not configured. Please set PAYSTACK_SECRET_KEY environment variable.',
    };
  }

  try {
    const response = await fetch(`${paystackConfig.baseUrl}/transaction/initialize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${paystackConfig.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...data,
        reference: data.reference || generateReference(),
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('[Paystack] Initialize failed:', result);
      return {
        status: false,
        message: result.message || 'Failed to initialize transaction',
        data: result.data,
      };
    }

    return result as PaystackInitializeResponse;
  } catch (error) {
    console.error('[Paystack] Initialize error:', error);
    return {
      status: false,
      message: error instanceof Error ? error.message : 'Network error',
    };
  }
}

/**
 * Verify a transaction with Paystack
 */
export async function verifyTransaction(
  reference: string
): Promise<PaystackVerifyResponse | PaystackErrorResponse> {
  if (!isPaystackConfigured()) {
    return {
      status: false,
      message: 'Paystack is not configured. Please set PAYSTACK_SECRET_KEY environment variable.',
    };
  }

  try {
    const response = await fetch(
      `${paystackConfig.baseUrl}/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${paystackConfig.secretKey}`,
        },
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error('[Paystack] Verify failed:', result);
      return {
        status: false,
        message: result.message || 'Failed to verify transaction',
        data: result.data,
      };
    }

    return result as PaystackVerifyResponse;
  } catch (error) {
    console.error('[Paystack] Verify error:', error);
    return {
      status: false,
      message: error instanceof Error ? error.message : 'Network error',
    };
  }
}

/**
 * Webhook secret, read at call time so a missing value is never cached.
 */
export function getWebhookSecret(): string {
  return process.env.PAYSTACK_WEBHOOK_SECRET || paystackConfig.webhookSecret || '';
}

/**
 * Constant-time string comparison (pure JS so this module stays safe to import
 * from client bundles via the barrel). Length mismatch returns false.
 */
function timingSafeEqualStrings(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Verify Paystack webhook signature
 * Paystack signs webhooks with HMAC SHA512
 */
export async function verifyWebhookSignature(
  payload: string,
  signature: string
): Promise<boolean> {
  // Fail closed in every environment: no secret means no way to authenticate
  // the caller, so the webhook must be rejected (issue #456).
  const secret = getWebhookSecret();
  if (!secret) {
    console.error(
      '[Paystack] PAYSTACK_WEBHOOK_SECRET is not set; rejecting webhook (fail closed)'
    );
    return false;
  }

  try {
    // Use Web Crypto API for edge runtime compatibility
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const data = encoder.encode(payload);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-512' },
      false,
      ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, data);
    const hashArray = Array.from(new Uint8Array(signatureBuffer));
    const hash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    return timingSafeEqualStrings(hash, (signature || '').toLowerCase());
  } catch (error) {
    console.error('[Paystack] Webhook signature verification error:', error);
    return false;
  }
}

/**
 * Get human-readable channel name
 */
export function getChannelDisplayName(channel: string | null): string {
  const channelNames: Record<string, string> = {
    card: 'Card Payment',
    bank: 'Bank Payment',
    ussd: 'USSD',
    qr: 'QR Code',
    mobile_money: 'Mobile Money',
    bank_transfer: 'Bank Transfer',
    eft: 'EFT',
  };

  return channel ? channelNames[channel] || channel : 'Online Payment';
}
