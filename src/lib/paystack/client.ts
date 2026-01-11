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
 * Verify Paystack webhook signature
 * Paystack signs webhooks with HMAC SHA512
 */
export async function verifyWebhookSignature(
  payload: string,
  signature: string
): Promise<boolean> {
  if (!paystackConfig.webhookSecret) {
    console.warn('[Paystack] Webhook secret not configured, skipping signature verification');
    return true; // Allow in development without secret
  }

  try {
    // Use Web Crypto API for edge runtime compatibility
    const encoder = new TextEncoder();
    const keyData = encoder.encode(paystackConfig.webhookSecret);
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

    return hash === signature;
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
