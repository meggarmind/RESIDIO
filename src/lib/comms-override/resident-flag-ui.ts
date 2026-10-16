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

/**
 * What the control shows. `current` is the form's value and stays `undefined` until the user touches the
 * control, so the display follows the resident's stored value on every render (a stored value that arrives
 * or changes after mount is shown, never a stale default).
 */
export function displayedFlag(stored: boolean | null | undefined, current: boolean | null | undefined): FlagSelectValue {
  return flagToSelectValue(current === undefined ? stored : current);
}

/** What a save sends: nothing (`undefined`) unless the user may manage the flag and changed the control. */
export function flagToSubmit(canManage: boolean, current: boolean | null | undefined): boolean | null | undefined {
  return canManage ? current : undefined;
}
