'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { getDebtStatuses, readDebtStatusSettings } from '@/lib/billing/debt-status';
import { loadReportableHouses } from '@/lib/whatsapp/debt-report';
import { summarizeDebtByStreet, type DebtByStreet } from '@/lib/billing/debt-by-street';

/**
 * Houses by debt status and street for the Collections dashboard chart (#1347). Same houses and
 * statuses as the debt status report (#982, #980). Read with the admin client after the
 * permission check, as the report does.
 */
export async function getDebtStatusByStreet(): Promise<{ data: DebtByStreet | null; error: string | null }> {
  const auth = await authorizePermission(PERMISSIONS.REPORTS_VIEW_FINANCIAL);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };

  try {
    const supabase = createAdminClient();
    const houses = await loadReportableHouses();
    const [statuses, settings] = await Promise.all([
      getDebtStatuses(supabase, { houseIds: houses.map((house) => house.id) }),
      readDebtStatusSettings(supabase),
    ]);
    return { data: summarizeDebtByStreet(houses, statuses, settings.labels), error: null };
  } catch (error) {
    console.error('[getDebtStatusByStreet] Debt status by street could not be read:', error);
    return { data: null, error: 'Debt status by street could not be read. Try again later.' };
  }
}
