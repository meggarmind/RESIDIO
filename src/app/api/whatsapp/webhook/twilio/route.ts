import { NextRequest, NextResponse } from 'next/server';
import {
  canPerformWhatsAppFinancialLookup,
  createSupabaseProcessedMessageStore,
  createSupabaseWhatsAppFinancialRepository,
  createSupabaseWhatsAppIdentityRepository,
  handleFinancialMessage,
  handleResidentMessage,
  processInboundMessages,
  resolveWhatsAppConfig,
} from '@/lib/whatsapp';
import { extractTwilioMessages, verifyTwilioSignature } from '@/lib/whatsapp/providers/twilio';

/**
 * Reconstructs the public URL Twilio actually called, for signature
 * verification.
 *
 * Twilio's HMAC covers the exact URL of the request it sent -- scheme, host,
 * path and query string. This app deploys behind a proxy (Vercel), which
 * terminates TLS and forwards to the app on an internal origin; `request.url`
 * / `request.nextUrl` can therefore report `http://` and an internal host
 * rather than the `https://` public hostname Twilio signed against. Using the
 * internal origin here would verify correctly in local dev (no proxy in the
 * way) and then fail every request in production -- exactly the kind of bug
 * that doesn't show up until it's live. `x-forwarded-proto` /
 * `x-forwarded-host` carry what the proxy actually received from Twilio, so
 * prefer those when present and fall back to `request.nextUrl` otherwise
 * (e.g. local dev with no proxy in front).
 *
 * Exported (rather than inlined) so a test can call it directly against a
 * request built with explicit forwarded headers, without needing a real
 * proxy in front of it.
 */
export function resolvePublicRequestUrl(request: NextRequest): string {
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const forwardedHost = request.headers.get('x-forwarded-host');

  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}${request.nextUrl.pathname}${request.nextUrl.search}`;
  }

  return request.nextUrl.toString();
}

export async function POST(request: NextRequest) {
  const resolved = await resolveWhatsAppConfig();

  if (resolved.status === 'unusable') {
    // Distinct from "not configured": credentials are stored but unreadable,
    // so every signature check would fail against the wrong auth token.
    return NextResponse.json(
      { error: `Webhook credentials are unusable: ${resolved.reason}` },
      { status: 503 }
    );
  }

  if (resolved.status !== 'ok' || resolved.config.provider !== 'twilio') {
    return NextResponse.json({ error: 'Webhook is not configured' }, { status: 503 });
  }

  const config = resolved.config;

  const rawBody = await request.text();
  const params = Object.fromEntries(new URLSearchParams(rawBody).entries());
  const signature = request.headers.get('x-twilio-signature');
  const url = resolvePublicRequestUrl(request);

  if (!verifyTwilioSignature(url, params, config.authToken, signature)) {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
  }

  const result = await processInboundMessages(extractTwilioMessages(params), {
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
