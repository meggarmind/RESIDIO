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
  | { ok: true; id: string | undefined }
  /** `retryable` is present (true) only for a transient failure (#546). */
  | { ok: false; error: string; retryable?: true };

export interface ResendTransportOptions {
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

  const fromName = (await getSettingValueAsService('email_from_name')) || 'Residio Estate';
  const { to, subject, ...content } = params;

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
        ? { ok: false, error: error.message, retryable: true }
        : { ok: false, error: error.message };
    }
    return { ok: true, id: data?.id };
  } catch (e) {
    // A thrown error is a network/timeout failure: the request may not have
    // reached Resend, and the idempotency key makes a repeat safe either way.
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Unknown error sending email',
      retryable: true,
    };
  }
}
