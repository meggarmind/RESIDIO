'use server';

/**
 * Email Fetching Actions
 *
 * Permission-guarded entry point for manual Gmail fetches. The fetch itself
 * lives in '@/lib/email-imports/fetch-emails' (not a server action); the cron
 * route calls that directly after verifyCronAuth (#488).
 */

import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { runEmailFetch } from '@/lib/email-imports/fetch-emails';
import type { FetchEmailsOptions, FetchEmailsResult } from '@/types/database';

/**
 * Fetch new emails as a manual trigger. There is deliberately no `trigger`
 * parameter: a client can post any arguments to a server action, so the
 * trigger is always 'manual' and any `trigger` key in `options` is ignored.
 */
export async function fetchNewEmails(
  options: Omit<FetchEmailsOptions, 'trigger'> = {}
): Promise<FetchEmailsResult> {
  const auth = await authorizePermission(PERMISSIONS.EMAIL_IMPORTS_TRIGGER);
  if (!auth.authorized) {
    return {
      success: false,
      importId: null,
      emailsFetched: 0,
      emailsSkipped: 0,
      emailsErrored: 0,
      error: auth.error || 'Unauthorized',
    };
  }

  const { maxEmails, sinceDays } = options ?? {};
  return runEmailFetch('manual', { maxEmails, sinceDays });
}
