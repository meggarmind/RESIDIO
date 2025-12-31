/**
 * SMS module for Residio
 *
 * Uses Termii as the SMS gateway for Nigerian mobile networks.
 * Environment variables required:
 * - TERMII_API_KEY: Your Termii API key
 * - TERMII_SENDER_ID: Sender ID (defaults to "Residio")
 */

export { sendSms, sendVerificationSms } from './send-sms';
export { isSmsConfigured, normalizePhoneNumber, formatPhoneForTermii } from './termii';
export type {
  SmsType,
  SmsRecipient,
  SendSmsOptions,
  SendSmsResult,
  SmsLogEntry,
} from './types';
