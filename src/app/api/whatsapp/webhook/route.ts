import { NextRequest, NextResponse } from 'next/server';
import {
  createSupabaseProcessedMessageStore,
  createSupabaseWhatsAppIdentityRepository,
  createSupabaseWhatsAppFinancialRepository,
  handleFinancialMessage,
  canPerformWhatsAppFinancialLookup,
  handleResidentMessage,
  handleInboundMessage,
  resolveWhatsAppConfig,
  verifyWhatsAppSignature,
  verifyWhatsAppToken,
} from '@/lib/whatsapp';

export async function GET(request: NextRequest) {
  const resolved = await resolveWhatsAppConfig();

  // Report unreadable credentials as such, rather than letting them fall
  // through to the 403 below. Meta shows a failed verification to the admin,
  // whose every instinct is then to suspect the verify token -- re-copying and
  // re-pasting a token that was never the problem. A 403 naming the wrong
  // cause is worse than a 503 naming none, because it sends someone somewhere
  // specific and wrong. POST already distinguishes these; GET must match.
  if (resolved.status === 'unusable') {
    return NextResponse.json(
      { error: `Webhook credentials are unusable: ${resolved.reason}` },
      { status: 503 }
    );
  }

  const config = resolved.status === 'ok' ? resolved.config : null;
  const mode = request.nextUrl.searchParams.get('hub.mode');
  const token = request.nextUrl.searchParams.get('hub.verify_token');
  const challenge = request.nextUrl.searchParams.get('hub.challenge');

  if (
    config &&
    config.provider === 'meta' &&
    mode === 'subscribe' &&
    challenge &&
    verifyWhatsAppToken(token, config.verifyToken)
  ) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Webhook verification failed' }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const resolved = await resolveWhatsAppConfig();

  if (resolved.status === 'unusable') {
    // Distinct from "not configured": credentials are stored but unreadable,
    // so every signature check would fail against the wrong app secret.
    // Saying so here is the difference between a five-minute fix and a hunt.
    return NextResponse.json(
      { error: `Webhook credentials are unusable: ${resolved.reason}` },
      { status: 503 }
    );
  }

  if (resolved.status !== 'ok' || resolved.config.provider !== 'meta') {
    return NextResponse.json({ error: 'Webhook is not configured' }, { status: 503 });
  }

  const config = resolved.config;

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
