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
  | { ok: false; error: string };

/**
 * Send via Resend. Only the properties present on `params` are forwarded.
 * The from-name setting read is deliberately outside the try/catch: if it
 * throws, the exception propagates (sendEmail relies on that; sendViaEmail
 * wraps its own call).
 */
export async function sendViaResend(params: ResendTransportParams): Promise<ResendTransportResult> {
  if (!resend) return { ok: false, error: EMAIL_NOT_CONFIGURED_ERROR };

  const fromName = (await getSettingValueAsService('email_from_name')) || 'Residio Estate';
  const { to, subject, ...content } = params;

  try {
    const { data, error } = await resend.emails.send({
      from: `${fromName} <${emailConfig.fromAddress}>`,
      to,
      replyTo: emailConfig.replyTo,
      subject,
      ...content,
    } as Parameters<typeof resend.emails.send>[0]);

    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data?.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error sending email' };
  }
}
