/**
 * SMS provider contract (#1462). A provider sends one message to one number;
 * logging, the comms override and the history row stay in `send-sms.ts`.
 */

export const SMS_PROVIDER_NAMES = ['termii', 'hollatags'] as const;

export type SmsProviderName = (typeof SMS_PROVIDER_NAMES)[number];

/** `system_settings` key that holds the active provider. */
export const SMS_PROVIDER_SETTING_KEY = 'sms_provider';

export function isSmsProviderName(value: unknown): value is SmsProviderName {
  return typeof value === 'string' && (SMS_PROVIDER_NAMES as readonly string[]).includes(value);
}

export interface SmsProviderSendInput {
  /** The destination number, in any format `normalizePhoneNumber` accepts. */
  to: string;
  message: string;
}

export interface SmsProviderSendResult {
  success: boolean;
  messageId?: string;
  /** Set only when the provider reports an account balance. */
  balance?: number;
  error?: string;
}

export interface SmsProvider {
  name: SmsProviderName;
  isConfigured(): boolean;
  /** Returned by `sendSms` when the provider is chosen but has no credentials. */
  missingConfigError: string;
  send(input: SmsProviderSendInput): Promise<SmsProviderSendResult>;
}
