/**
 * Communications override (#713, #715): shared types.
 *
 * A data-exposure control. Every outbound email, SMS and WhatsApp message goes
 * through the resolver; anything unexpected BLOCKS the send rather than letting
 * it reach the original address.
 */

export type OverrideChannel = 'email' | 'sms' | 'whatsapp';

/**
 * Only the 2FA call sites may pass this (a self-addressed code to the signed-in
 * user). A scan test fails if any other file does.
 */
export type CommsPurpose = 'self_auth_2fa';

/** Optional context a send function accepts and forwards to the seam. */
export interface CommsSendContext {
  /**
   * Resident context. `undefined` = the recipient is not a resident (follows the
   * global switch). `null` = a resident whose flag is unset (follows the
   * environment default). `true`/`false` = the resident's explicit flag.
   */
  residentOverride?: boolean | null;
  purpose?: CommsPurpose;
}

export interface OverrideSettings {
  /** The stored global switch (ignored outside production). */
  enabled: boolean;
  email: string;
  phone: string;
  whatsappPhone: string;
  /** Debug Mode as stored (`comms_debug_mode`). */
  debugMode: boolean;
  /** ISO timestamp from `comms_debug_expires_at`, or null. */
  debugExpiresAt: string | null;
}

export type SettingsSnapshot =
  | { status: 'ok'; settings: OverrideSettings }
  | { status: 'error'; message: string };

export interface ResolveInput extends CommsSendContext {
  channel: OverrideChannel;
  original: string;
}

/** `global_switch` (production, switch on, no resident flag) is an addition to the issue's three reasons. */
export type RedirectReason = 'non_production' | 'resident_flag' | 'global_switch' | 'debug';

export type BlockCode = 'settings_unreadable' | 'override_missing' | 'unknown_channel';

export type BlockedResult = { blocked: true; code: BlockCode; reason: string; original: string };

export type ResolveResult =
  | { redirect: false }
  | { redirect: true; to: string; original: string; reason: RedirectReason }
  | BlockedResult;

/** What is written to `metadata.override` on the log row. */
export interface OverrideLogRecord {
  original: string;
  /** Where it actually went; null when the send was blocked. */
  actual: string | null;
  reason: string;
  blocked?: true;
}
