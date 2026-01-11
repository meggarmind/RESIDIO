import { NextRequest, NextResponse } from 'next/server';
import { processPaystackWebhook } from '@/actions/paystack';

/**
 * Paystack Webhook Handler
 *
 * POST /api/payments/paystack/webhook
 *
 * This endpoint receives webhook events from Paystack for:
 * - charge.success: Payment completed
 * - charge.failed: Payment failed
 *
 * Webhooks are critical for payment reconciliation. They provide
 * authoritative payment status even if the user closes the browser
 * before returning to the callback URL.
 *
 * Security:
 * - Paystack signs all webhooks with HMAC SHA512
 * - We verify the signature before processing
 * - Webhook secret is stored in PAYSTACK_WEBHOOK_SECRET env var
 */
export async function POST(request: NextRequest) {
  try {
    // Get raw body for signature verification
    const payload = await request.text();

    // Get signature from headers
    const signature = request.headers.get('x-paystack-signature') || '';

    if (!signature) {
      console.warn('[Paystack Webhook] No signature provided');
      return NextResponse.json(
        { error: 'Missing signature' },
        { status: 400 }
      );
    }

    // Process the webhook
    const result = await processPaystackWebhook(payload, signature);

    if (!result.success) {
      console.error('[Paystack Webhook] Processing failed:', result.error);
      // Return 200 to acknowledge receipt even on processing errors
      // Paystack will retry on 4xx/5xx responses
      return NextResponse.json(
        { received: true, processed: false, error: result.error },
        { status: 200 }
      );
    }

    console.log('[Paystack Webhook] Processed successfully:', result);

    return NextResponse.json({
      received: true,
      processed: true,
      action: result.action,
      transaction_id: result.transaction_id,
    });
  } catch (error) {
    console.error('[Paystack Webhook] Error:', error);
    // Return 200 to acknowledge receipt
    return NextResponse.json(
      { received: true, processed: false, error: 'Internal error' },
      { status: 200 }
    );
  }
}

// Disable body parsing - we need raw body for signature verification
export const config = {
  api: {
    bodyParser: false,
  },
};
