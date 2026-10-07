/**
 * SMS system types for Residio
 */

export type SmsType =
  | 'verification'
  | 'notification'
  | 'payment_reminder'
  | 'access_code'
  | 'emergency'
  | 'test';

export interface SmsRecipient {
  phone: string; // E.164 format preferred (e.g., +2348012345678)
  name?: string;
  residentId?: string;
}

export interface SendSmsOptions {
  to: SmsRecipient | SmsRecipient[];
  message: string;
  smsType: SmsType;
  metadata?: Record<string, unknown>;
  /**
   * Skip `sendSms`'s own `notification_history` row (#401). Set only by a
   * caller that writes its own history row for this send -- currently the
   * Chatmaid WhatsApp -> SMS fallback in `src/lib/notifications/send.ts`,
   * which needs a single row on the queue item rather than the orphaned
   * `queue_id: null` row `logSms` would otherwise write, and which also
   * needs to record the WhatsApp failure that triggered the fallback rather
   * than a bare 'sms' log. Defaults to `false` (unset): every other caller's
   * logging behaviour is unchanged.
   */
  skipHistoryLog?: boolean;
}

export interface SendSmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
  balance?: number; // Termii returns account balance
}

export interface SmsLogEntry {
  recipientPhone: string;
  recipientName?: string;
  residentId?: string;
  smsType: SmsType;
  message: string;
  messageId?: string;
  status: 'pending' | 'sent' | 'failed';
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

// Termii API response types
export interface TermiiSendResponse {
  code: string; // "ok" for success
  message_id?: string;
  message_id_str?: string;
  message?: string;
  balance?: number;
  user?: string;
}

export interface TermiiErrorResponse {
  code?: string;
  message?: string;
}
