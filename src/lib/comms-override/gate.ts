import { getCommsEnvironment } from './environment';
import { isExemptPurpose } from './types';
import { resolveRecipient } from './resolver';
import { loadOverrideSettings } from './settings';
import type { ResolveInput, ResolveResult, SettingsSnapshot } from './types';

/** Loads the settings for a send. The 2FA exemption never touches the database. */
export async function loadSnapshotFor(input: Pick<ResolveInput, 'purpose'>): Promise<SettingsSnapshot> {
  if (isExemptPurpose(input.purpose)) {
    // Never read by the resolver: the exemption short-circuits first.
    return { status: 'error', message: 'not loaded: exempt purpose' };
  }
  return loadOverrideSettings();
}

/**
 * The one call a send seam makes. Loads settings and the environment and
 * resolves; the seam then only applies the result.
 */
export async function decideSend(
  input: ResolveInput,
  snapshot?: SettingsSnapshot
): Promise<{ result: ResolveResult; envLabel: string }> {
  const environment = getCommsEnvironment();
  const loaded = snapshot ?? (await loadSnapshotFor(input));
  return { result: resolveRecipient(input, loaded, environment), envLabel: environment.label };
}
