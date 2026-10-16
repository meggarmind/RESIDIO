import { isExemptPurpose } from './types';
import type {
  BlockCode,
  BlockedResult,
  OverrideChannel,
  OverrideLogRecord,
  RedirectReason,
  ResolveInput,
  ResolveResult,
  SettingsSnapshot,
} from './types';

const EMAIL_PATTERN = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const E164_PATTERN = /^\+[1-9]\d{6,14}$/;

export function isValidOverrideEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}

export function isValidOverridePhone(value: string): boolean {
  return E164_PATTERN.test(value);
}

/** Debug Mode is effective unless an expiry is present and in the past. */
function isDebugEffective(debugMode: boolean, expiresAt: string | null, now: Date): boolean {
  if (!debugMode) return false;
  if (!expiresAt) return true;
  const expiry = Date.parse(expiresAt);
  // Unparseable expiry: keep the redirect on (fail closed).
  if (Number.isNaN(expiry)) return true;
  return expiry > now.getTime();
}

function block(input: ResolveInput, code: BlockCode, reason: string): BlockedResult {
  return { blocked: true, code, reason, original: input.original };
}

/**
 * Pure decision: should this message be redirected, sent as-is, or blocked?
 *
 *   debug     = debugModeEffective
 *   global    = !production || storedSwitch
 *   resident  = residentOverride ?? !production      (only with resident context)
 *   redirect  = debug || (global && resident)         residents
 *   redirect  = debug || global                       no resident context
 *
 * Blocked, never sent to the original, when a redirect is required but the
 * override value for the channel is blank or invalid, when the settings could
 * not be read, or when the channel is unknown.
 */
export function resolveRecipient(
  input: ResolveInput,
  snapshot: SettingsSnapshot,
  environment: { isProduction: boolean },
  now: Date = new Date()
): ResolveResult {
  // The 2FA exemption is decided before anything else, including the settings.
  if (isExemptPurpose(input.purpose)) return { redirect: false };

  const channel: OverrideChannel = input.channel;
  if (channel !== 'email' && channel !== 'sms' && channel !== 'whatsapp') {
    return block(input, 'unknown_channel', `unknown channel "${String(channel)}"`);
  }

  if (snapshot.status !== 'ok') {
    return block(input, 'settings_unreadable', 'override settings could not be read');
  }
  const { settings } = snapshot;

  const debug = isDebugEffective(settings.debugMode, settings.debugExpiresAt, now);
  const global = !environment.isProduction || settings.enabled;
  const hasResidentContext = input.residentOverride !== undefined;
  const residentFlag = input.residentOverride ?? !environment.isProduction;

  const redirect = debug || (hasResidentContext ? global && residentFlag : global);
  if (!redirect) return { redirect: false };

  const reason: RedirectReason = debug
    ? 'debug'
    : input.residentOverride === true
      ? 'resident_flag'
      : !environment.isProduction
        ? 'non_production'
        : 'global_switch';

  let to: string;
  let missing: string | null = null;
  if (channel === 'email') {
    to = settings.email;
    if (!isValidOverrideEmail(to)) missing = 'override email is blank or invalid';
  } else if (channel === 'sms') {
    to = settings.phone;
    if (!isValidOverridePhone(to)) missing = 'override phone is blank or invalid';
  } else {
    to = settings.whatsappPhone || settings.phone;
    if (!isValidOverridePhone(to)) missing = 'override WhatsApp number and override phone are blank or invalid';
  }
  if (missing) return block(input, 'override_missing', missing);

  return { redirect: true, to, original: input.original, reason };
}

/** The `metadata.override` record for a decision, or null when nothing was altered. */
export function toLogRecord(result: ResolveResult): OverrideLogRecord | null {
  if ('blocked' in result) {
    return { original: result.original, actual: null, reason: result.reason, blocked: true };
  }
  if (result.redirect) {
    return { original: result.original, actual: result.to, reason: result.reason };
  }
  return null;
}

/** Error text for a blocked send, in the shape the issue specifies. */
export function blockedError(result: BlockedResult): string {
  return `comms override blocked: ${result.reason}`;
}
