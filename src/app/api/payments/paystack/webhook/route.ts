import { NextRequest, NextResponse } from 'next/server';
import { processPaystackWebhook } from '@/actions/paystack';
import { getWebhookSecret } from '@/lib/paystack/client';
import { recordWebhookDelivery } from '@/lib/system-log/webhook';

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
  // Fail closed: without a configured secret nothing can be authenticated.
  if (!getWebhookSecret()) {
    console.error('[Paystack Webhook] PAYSTACK_WEBHOOK_SECRET is not set; refusing to process');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }

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

    if (!result.success && result.error === 'Invalid webhook signature') {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    if (!result.success) {
      console.error('[Paystack Webhook] Processing failed:', result.error);
      // Signature already verified above, so this is a genuine failed delivery.
      await recordWebhookDelivery({
        provider: 'paystack',
        action: 'payment_event',
        outcome: 'failure',
        error: result.error,
      });
      // Return 200 to acknowledge receipt even on processing errors
      // Paystack will retry on 4xx/5xx responses
      return NextResponse.json(
        { received: true, processed: false, error: result.error },
        { status: 200 }
      );
    }

    console.log('[Paystack Webhook] Processed successfully:', result);

    // Only a delivery that changed state is worth a row; ignored events and
    // redeliveries of an already-processed transaction are not.
    if (result.action !== 'ignored' && result.action !== 'already_processed') {
      await recordWebhookDelivery({
        provider: 'paystack',
        action: 'payment_event',
        outcome: 'success',
        summary: { action: result.action, transactionId: result.transaction_id },
      });
    }

    return NextResponse.json({
      received: true,
      processed: true,
      action: result.action,
      transaction_id: result.transaction_id,
    });
  } catch (error) {
    console.error('[Paystack Webhook] Error:', error);
    // Deliberately not recorded: an exception here may precede signature verification
    // (e.g. reading the body), and nothing is logged before the signature is verified.
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
