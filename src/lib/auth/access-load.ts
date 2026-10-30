/**
 * Loading the signed-in user's access before the app opens (#1341).
 *
 * - 'loaded': the profile and its permissions were read.
 * - 'incomplete': the profile has a role, but `get_my_access()` returned no rows. Before the
 *   second sign-in step is done the database returns nothing (#1029), so this snapshot must not
 *   be cached or trusted. It is also the state of an account that is not approved yet.
 * - 'failed': the profile or the permission lookup failed or timed out.
 */
export type ProfileLoadResult = 'loaded' | 'incomplete' | 'failed';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs `load` until it reports 'loaded', at most `attempts` times, waiting a little longer
 * before each retry. Returns the last result.
 */
export async function loadAccessWithRetry(
  load: () => Promise<ProfileLoadResult>,
  { attempts = 3, delayMs = 400, wait = sleep }: { attempts?: number; delayMs?: number; wait?: (ms: number) => Promise<void> } = {}
): Promise<ProfileLoadResult> {
  let result: ProfileLoadResult = 'failed';
  for (let attempt = 1; attempt <= attempts; attempt++) {
    result = await load();
    if (result === 'loaded') return result;
    if (attempt < attempts) await wait(delayMs * attempt);
  }
  return result;
}
