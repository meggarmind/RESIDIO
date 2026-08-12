import { NextRequest, NextResponse } from 'next/server';
import {
  createSupabaseProcessedMessageStore,
  createSupabaseWhatsAppIdentityRepository,
  createSupabaseWhatsAppFinancialRepository,
  handleFinancialMessage,
  canPerformWhatsAppFinancialLookup,
  handleResidentMessage,
  handleInboundMessage,
  getWhatsAppConfig,
  verifyWhatsAppSignature,
  verifyWhatsAppToken,
} from '@/lib/whatsapp';

export async function GET(request: NextRequest) {
  const config = getWhatsAppConfig();
  const mode = request.nextUrl.searchParams.get('hub.mode');
  const token = request.nextUrl.searchParams.get('hub.verify_token');
  const challenge = request.nextUrl.searchParams.get('hub.challenge');

  if (
    config &&
    mode === 'subscribe' &&
    challenge &&
    verifyWhatsAppToken(token, config.verifyToken)
  ) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Webhook verification failed' }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const config = getWhatsAppConfig();

  if (!config) {
    return NextResponse.json({ error: 'Webhook is not configured' }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256');

  if (!verifyWhatsAppSignature(rawBody, signature, config.appSecret)) {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
  }

  let payload: Parameters<typeof handleInboundMessage>[0];
  try {
    payload = JSON.parse(rawBody) as Parameters<typeof handleInboundMessage>[0];
  } catch {
    return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 });
  }

  const result = await handleInboundMessage(payload, {
    store: createSupabaseProcessedMessageStore(),
    onMessage: async (message) => {
      await handleResidentMessage(message, {
        repository: createSupabaseWhatsAppIdentityRepository(),
        onIdentified: async (identifiedMessage, identity) => {
          if (!identity.financialEligible) {
            return;
          }
            await handleFinancialMessage(identifiedMessage, identity, {
              repository: createSupabaseWhatsAppFinancialRepository(),
              optedIn: true,
              canLookup: canPerformWhatsAppFinancialLookup,
            });
        },
      });
    },
  });

  if (!result.accepted) {
    return NextResponse.json(
      { received: true, processed: false, error: result.error },
      { status: 500 }
    );
  }

  return NextResponse.json({
    received: true,
    processed: true,
    processed_count: result.processedCount,
    duplicate_count: result.duplicateCount,
    ignored_count: result.ignoredCount,
  });
}
