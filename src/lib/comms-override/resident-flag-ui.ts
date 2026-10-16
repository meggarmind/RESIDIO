/**
 * Pure, client-safe helpers for the three-state resident control (#716).
 * Kept apart from `resident-flag.ts`, which imports the server Supabase client.
 *
 *   follow default         -> null
 *   use override           -> true
 *   send to real recipient -> false
 */
export type FlagSelectValue = 'default' | 'override' | 'real';

export function flagToSelectValue(flag: boolean | null | undefined): FlagSelectValue {
  if (flag === true) return 'override';
  if (flag === false) return 'real';
  return 'default';
}

export function selectValueToFlag(value: string): boolean | null {
  if (value === 'override') return true;
  if (value === 'real') return false;
  return null;
}

export const FLAG_OPTION_LABELS: Record<FlagSelectValue, string> = {
  default: 'Follow environment default',
  override: 'Use override contacts',
  real: 'Send to real recipient',
};

/** What "follow environment default" means in the running environment. */
export function describeEnvironmentDefault(isProduction: boolean): string {
  return isProduction
    ? 'In this environment (production) the default is to send to the real recipient.'
    : 'In this environment (not production) the default is to redirect messages to the override contacts.';
}

export const REAL_RECIPIENT_WARNING =
  'Send to real recipient lets real messages reach this resident even outside production (for example from Stage). Debug Mode still redirects.';
