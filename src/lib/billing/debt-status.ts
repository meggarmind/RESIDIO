import type { SupabaseClient } from '@supabase/supabase-js';
import type { createAdminClient, createServerSupabaseClient } from '@/lib/supabase/server';
import {
  DEBT_STATUS_CHAT_PDF_LIMIT_KEY,
  DEBT_STATUS_FOOTNOTE_KEY,
  DEBT_STATUS_LABEL_KEYS,
  DEBT_STATUS_THRESHOLD_KEY,
  settingValueError,
} from '@/lib/validators/setting-value';

type DebtStatusClient = Awaited<ReturnType<typeof createServerSupabaseClient>> | ReturnType<typeof createAdminClient>;

/**
 * App-wide debt status of a house (#980). The rule lives in one database function,
 * get_debt_statuses (supabase/migrations/20261022180000_debt_status.sql), and this module is its
 * only wrapper:
 *   - an owed invoice is unpaid or part-paid, still has something due, and its period has started;
 *   - 1 owed invoice up to the threshold (default 3) is outstanding, more is arrears;
 *   - nothing owed with wallet credit is credit, otherwise paid_in_full.
 * Only the labels, the threshold, the report footnote and the chat-PDF house limit are editable
 * (Settings > Debt Status). The four statuses and the counting rule stay in code.
 */
export type DebtStatus = 'arrears' | 'outstanding' | 'paid_in_full' | 'credit';

/** Most to least owed. */
export const DEBT_STATUSES: readonly DebtStatus[] = ['arrears', 'outstanding', 'paid_in_full', 'credit'];

export const DEBT_STATUS_SETTING_KEYS = {
  labels: DEBT_STATUS_LABEL_KEYS satisfies Record<DebtStatus, string>,
  arrearsThresholdMonths: DEBT_STATUS_THRESHOLD_KEY,
  reportFootnote: DEBT_STATUS_FOOTNOTE_KEY,
  chatPdfHouseLimit: DEBT_STATUS_CHAT_PDF_LIMIT_KEY,
} as const;

export interface DebtStatusSettings {
  labels: Record<DebtStatus, string>;
  /** Owed invoices up to this count are outstanding; more is arrears. */
  arrearsThresholdMonths: number;
  /** Printed under the debt status report. */
  reportFootnote: string;
  /** A debt status PDF covering more houses than this goes by email instead of chat. */
  chatPdfHouseLimit: number;
}

/** What the migration seeds, and what a missing or invalid setting reads as. */
export const DEBT_STATUS_DEFAULTS: DebtStatusSettings = {
  labels: { arrears: 'Arrears', outstanding: 'Outstanding', paid_in_full: 'Paid in Full', credit: 'Credit' },
  arrearsThresholdMonths: 3,
  reportFootnote: 'For any unlisted residence, contact the Financial Secretary.',
  chatPdfHouseLimit: 40,
};

export const ALL_DEBT_STATUS_SETTING_KEYS: string[] = [
  ...Object.values(DEBT_STATUS_SETTING_KEYS.labels),
  DEBT_STATUS_SETTING_KEYS.arrearsThresholdMonths,
  DEBT_STATUS_SETTING_KEYS.reportFootnote,
  DEBT_STATUS_SETTING_KEYS.chatPdfHouseLimit,
];

export interface HouseDebtStatus {
  houseId: string;
  /** Whose wallet was read: the given resident, else the house's billed resident (null when none). */
  residentId: string | null;
  status: DebtStatus;
  /** The editable label for the status. */
  label: string;
  /** Owed invoices whose period has started. */
  owedInvoiceCount: number;
  walletBalance: number;
}

type SettingRow = { key: string; value: unknown };

/** A stored value of a valid setting, unquoted; anything invalid or missing keeps the default. */
function pick<T extends string | number>(rows: SettingRow[], key: string, fallback: T): T {
  const row = rows.find((r) => r.key === key);
  if (!row || settingValueError(key, row.value) !== null) return fallback;
  const value = typeof fallback === 'number' ? Number(row.value) : String(row.value).trim();
  return value as T;
}

/** Parses system_settings rows; exported for the Settings page, which already holds them. */
export function parseDebtStatusSettings(rows: SettingRow[]): DebtStatusSettings {
  const keys = DEBT_STATUS_SETTING_KEYS;
  const defaults = DEBT_STATUS_DEFAULTS;
  return {
    labels: Object.fromEntries(
      DEBT_STATUSES.map((status) => [status, pick(rows, keys.labels[status], defaults.labels[status])]),
    ) as Record<DebtStatus, string>,
    arrearsThresholdMonths: pick(rows, keys.arrearsThresholdMonths, defaults.arrearsThresholdMonths),
    reportFootnote: pick(rows, keys.reportFootnote, defaults.reportFootnote),
    chatPdfHouseLimit: pick(rows, keys.chatPdfHouseLimit, defaults.chatPdfHouseLimit),
  };
}

/** The editable debt status settings, defaults filling any gap. */
export async function readDebtStatusSettings(supabase: DebtStatusClient): Promise<DebtStatusSettings> {
  const { data, error } = await supabase.from('system_settings').select('key, value').in('key', ALL_DEBT_STATUS_SETTING_KEYS);
  if (error) throw new Error(`Debt status settings could not be read: ${error.message}`);
  return parseDebtStatusSettings(data ?? []);
}

type DebtStatusRow = {
  house_id: string;
  resident_id: string | null;
  status: DebtStatus;
  owed_invoice_count: number | string;
  wallet_balance: number | string;
};

/**
 * Debt status per house, in one query for any number of houses.
 *
 * - `houseIds` omitted or null: every active house (the estate report).
 * - `residentId` given: each house counts only that resident's invoices and reads that resident's
 *   wallet (a resident-level view). Otherwise a house counts every invoice billed to it and reads
 *   its billed resident's wallet (tenant, else resident landlord, else non-resident landlord).
 *
 * Runs with the caller's RLS: use the admin client for WhatsApp and reports. Throws on a read error.
 */
export async function getDebtStatuses(
  supabase: DebtStatusClient,
  params: { houseIds?: string[] | null; residentId?: string | null } = {},
): Promise<HouseDebtStatus[]> {
  if (params.houseIds && params.houseIds.length === 0) return [];
  // get_debt_statuses is not in the generated types until 20261022180000 is applied and
  // `npm run db:types` is re-run; drop the cast then.
  const [rpc, settings] = await Promise.all([
    (supabase as unknown as SupabaseClient).rpc('get_debt_statuses', {
      p_house_ids: params.houseIds ?? null,
      p_resident_id: params.residentId ?? null,
    }),
    readDebtStatusSettings(supabase),
  ]);
  if (rpc.error) throw new Error(`Debt status could not be read: ${rpc.error.message}`);
  return ((rpc.data ?? []) as DebtStatusRow[]).map((row) => ({
    houseId: row.house_id,
    residentId: row.resident_id,
    status: row.status,
    label: settings.labels[row.status],
    owedInvoiceCount: Number(row.owed_invoice_count),
    walletBalance: Number(row.wallet_balance),
  }));
}
