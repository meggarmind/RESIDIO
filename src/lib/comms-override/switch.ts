import type { Json } from '@/types/database.generated';

/**
 * A switch value. Absent is off; `true`/`'true'` is on; `false`/`'false'` is
 * off; anything else is unrecognised and counts as ON, so a corrupted value can
 * only ever widen the redirect.
 *
 * Kept free of runtime imports so the middleware can use it (#789): the rest of
 * `./settings` pulls in the server-only settings service.
 */
export function parseSwitch(value: Json | undefined): boolean {
  if (value === undefined || value === null) return false;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return true;
}
