import type { SupabaseClient } from '@supabase/supabase-js';
import type { createAdminClient, createServerSupabaseClient } from '@/lib/supabase/server';
import { getSettingResultAsService } from '@/lib/settings/service';

type BalanceClient = Awaited<ReturnType<typeof createServerSupabaseClient>> | ReturnType<typeof createAdminClient>;

/** Off by default: residents see the roll-forward balance only once legacy charges are invoiced (#863 decision 8). */
export const RESIDENT_ROLL_FORWARD_SETTING = 'balance_roll_forward_resident_enabled';

/** Positive is owed, negative is in credit. Totals cover the period only. */
export interface AccountBalance {
  openingBalance: number;
  closingBalance: number;
  totalInvoiced: number;
  totalPaid: number;
  totalCredits: number;
  totalDebits: number;
  awaitingVerification: number;
}

type BalanceRow = Record<
  'opening_balance' | 'closing_balance' | 'total_invoiced' | 'total_paid' | 'total_wallet_credits' | 'total_wallet_debits' | 'awaiting_verification',
  number | string
>;

/**
 * The roll-forward balance from resident_account_balance (#863): the one computation behind
 * statement opening and closing balances and the Assistant's "What I owe". A null house means all
 * the resident's properties, which is the only case that counts wallet rows. Dates are Lagos days.
 */
export async function fetchAccountBalance(
  supabase: BalanceClient,
  params: { residentId: string; houseId?: string | null; fromDate: string; toDate: string }
): Promise<AccountBalance> {
  // resident_account_balance is not in the generated types until 20261022140000 is applied and
  // `npm run db:types` is re-run; drop the cast then.
  const { data, error } = await (supabase as unknown as SupabaseClient)
    .rpc('resident_account_balance', {
      p_resident_id: params.residentId,
      p_house_id: params.houseId ?? null,
      p_from: params.fromDate,
      p_to: params.toDate,
    })
    .single();
  if (error || !data) throw new Error(`Account balance could not be read: ${error?.message || 'no data'}`);
  const row = data as BalanceRow;
  return {
    openingBalance: Number(row.opening_balance),
    closingBalance: Number(row.closing_balance),
    totalInvoiced: Number(row.total_invoiced),
    totalPaid: Number(row.total_paid),
    totalCredits: Number(row.total_wallet_credits),
    totalDebits: Number(row.total_wallet_debits),
    awaitingVerification: Number(row.awaiting_verification),
  };
}

/** Whether resident-facing figures use the roll-forward balance; an unreadable setting keeps today's figures. */
export async function isResidentRollForwardEnabled(): Promise<boolean> {
  const result = await getSettingResultAsService(RESIDENT_ROLL_FORWARD_SETTING);
  return result.status === 'ok' && result.value === true;
}
