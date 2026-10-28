/**
 * Shared Resend transport (#550).
 *
 * The one place `resend.emails.send` is called. Callers (`sendEmail`,
 * `sendViaEmail`) keep their own enable gate, validation, logging and return
 * shapes; this only owns the config check message, the from/replyTo
 * construction and the Resend error mapping.
 */
import type { ReactNode } from 'react';
import { resend, emailConfig, isEmailConfigured } from './resend';
import { getSettingValueAsService } from '@/lib/settings/service';
import { createAdminClient } from '@/lib/supabase/server';
import { decideSend } from '@/lib/comms-override/gate';
import { applyEmailRedirect } from '@/lib/comms-override/apply';
import { blockedError, toLogRecord } from '@/lib/comms-override/resolver';
import type { CommsSendContext, OverrideLogRecord } from '@/lib/comms-override/types';

export const EMAIL_NOT_CONFIGURED_ERROR = 'Email service not configured (missing RESEND_API_KEY)';

/** Returns the not-configured message, or null when Resend is usable. */
export function getEmailTransportError(): string | null {
  return !isEmailConfigured() || !resend ? EMAIL_NOT_CONFIGURED_ERROR : null;
}

export interface ResendTransportParams {
  to: string | string[];
  subject: string;
  react?: ReactNode;
  attachments?: Array<{ filename: string; content: Buffer }>;
  html?: string;
  text?: string;
}

export type ResendTransportResult =
  /** `override` is set when the communications override altered or blocked the send (#715). */
  | { ok: true; id: string | undefined; override?: OverrideLogRecord }
  /** `retryable` is present (true) only for a transient failure (#546). */
  | { ok: false; error: string; retryable?: true; retryAt?: string; override?: OverrideLogRecord };

export interface ResendTransportOptions extends CommsSendContext {
  /** Sent to Resend as the Idempotency-Key so a retried attempt cannot double-send (#546). */
  idempotencyKey?: string;
}

const RETRYABLE_RESEND_ERROR_NAMES = new Set([
  'rate_limit_exceeded',
  'application_error',
  'internal_server_error',
]);

/** Transient Resend failures: 5xx, 429, 408, or a transient error name. */
export function isRetryableResendError(error: { statusCode?: number | null; name?: string }): boolean {
  const status = error.statusCode;
  if (typeof status === 'number' && (status >= 500 || status === 429 || status === 408)) return true;
  return typeof error.name === 'string' && RETRYABLE_RESEND_ERROR_NAMES.has(error.name);
}

const DEFAULT_DAILY_CAP = 90;
export const DAILY_LIMIT_ERROR = 'Daily email limit reached';

/**
 * Daily cap (#1265): keeps the app under the Resend plan's 100 sends a day. Login codes
 * are exempt and use the headroom. Returns a refusal, or null when the send may go ahead.
 * An unreadable count refuses, so a database fault cannot lift the cap.
 */
async function checkDailyCap(purpose: ResendTransportOptions['purpose']): Promise<ResendTransportResult | null> {
  if (purpose === 'self_auth_2fa') return null;

  const configured = await getSettingValueAsService('email_outbound_daily_cap');
  const cap = typeof configured === 'number' && Number.isInteger(configured) ? configured : DEFAULT_DAILY_CAP;
  if (cap <= 0) return { ok: false, error: 'Email is capped at zero in system settings' };

  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const { count, error } = await createAdminClient()
    .from('notification_history')
    .select('id', { count: 'exact', head: true })
    .eq('channel', 'email')
    .eq('status', 'sent')
    .gte('sent_at', startOfDay.toISOString());
  if (error || count === null) return { ok: false, error: 'Unable to verify email daily limit' };

  if (count >= cap) {
    const nextMidnight = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
    return { ok: false, error: DAILY_LIMIT_ERROR, retryable: true, retryAt: nextMidnight.toISOString() };
  }
  return null;
}

/**
 * Send via Resend. Only the properties present on `params` are forwarded.
 * The from-name setting read is deliberately outside the try/catch: if it
 * throws, the exception propagates (sendEmail relies on that; sendViaEmail
 * wraps its own call).
 */
export async function sendViaResend(
  params: ResendTransportParams,
  options?: ResendTransportOptions
): Promise<ResendTransportResult> {
  if (!resend) return { ok: false, error: EMAIL_NOT_CONFIGURED_ERROR };

  // Communications override (#715): decided at send time, after the not-configured
  // check so an unconfigured transport keeps its message. Blocked never falls
  // through to the original address.
  const original = (Array.isArray(params.to) ? params.to : [params.to]).join(', ');
  const { result: decision, envLabel } = await decideSend({
    channel: 'email',
    original,
    residentOverride: options?.residentOverride,
    purpose: options?.purpose,
  });
  const override = toLogRecord(decision) ?? undefined;
  if ('blocked' in decision) {
    return {
      ok: false,
      error: blockedError(decision),
      override,
      // An unreadable settings table is transient; a blank override needs an admin.
      ...(decision.code === 'settings_unreadable' ? { retryable: true as const } : {}),
    };
  }

  const capped = await checkDailyCap(options?.purpose);
  if (capped) return { ...capped, override };

  const outbound = decision.redirect ? applyEmailRedirect(params, decision, envLabel) : params;

  const fromName = (await getSettingValueAsService('email_from_name')) || 'Residio Estate';
  const { to, subject, ...content } = outbound;

  try {
    const payload = {
      from: `${fromName} <${emailConfig.fromAddress}>`,
      to,
      replyTo: emailConfig.replyTo,
      subject,
      ...content,
    } as Parameters<typeof resend.emails.send>[0];
    const { data, error } = options?.idempotencyKey
      ? await resend.emails.send(payload, { idempotencyKey: options.idempotencyKey })
      : await resend.emails.send(payload);

    if (error) {
      return isRetryableResendError(error)
        ? { ok: false, error: error.message, retryable: true, override }
        : { ok: false, error: error.message, override };
    }
    return { ok: true, id: data?.id, override };
  } catch (e) {
    // A thrown error is a network/timeout failure, so it is treated as
    // retryable. The idempotency key does NOT make that safe if the first
    // request actually landed: the next attempt uses attempt + 1, a different
    // key. The key only protects overlapping runs and a crash before the queue
    // row is updated (same attempt number, same key).
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Unknown error sending email',
      retryable: true,
      override,
    };
  }
}
