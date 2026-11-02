import type { SupabaseClient } from '@supabase/supabase-js';
import { recordAudit, type AuditEntry } from '@/lib/audit/recorder';
import { loadLiveReviewer } from '@/lib/approvals/decision';
import { DEFAULT_CHARGE_CATEGORY } from '@/lib/billing/charge-categories';
import { readEmailAutoProcessLimit } from '@/lib/email-imports/auto-record';
import { createPaymentAsAdmin } from '@/lib/payments/create-payment';
import { createAdminClient } from '@/lib/supabase/server';
import { embed, sanitizeSearchInput } from '@/lib/utils';
import { lagosDateString } from '@/lib/whatsapp/assistant-format';

/**
 * Database reads and writes for Unverified payments (#1424, Admin tools item 6). Service-role, with
 * no web session: NOT a server action. The caller re-checks the admin's live permissions before any
 * write, and every audit entry names the admin as actor with `channel: whatsapp_admin`.
 */

export const WHATSAPP_ADMIN_CHANNEL = { channel: 'whatsapp_admin' } as const;

/** The house's resident a payment is recorded for: the same order get_debt_statuses picks by. */
export const HOUSE_RESIDENT_ROLES = ['tenant', 'resident_landlord', 'non_resident_landlord'];

/** An email-import credit waiting in the review queue: a bank alert with no resident. */
export interface UnverifiedAlert {
  id: string;
  amount: number;
  /** Lagos calendar day, `YYYY-MM-DD`. */
  date: string;
  createdAt: string;
  description: string | null;
  reference: string | null;
  emailImportId: string;
  /** The transaction date as stored, for the payment date. */
  transactionDate: string | null;
}

/** A payment with no bank proof: is_verified false, not a resident report waiting in Approvals (item 5). */
export interface UnverifiedPayment {
  id: string;
  amount: number;
  /** `YYYY-MM-DD`. */
  date: string;
  createdAt: string;
  houseCode: string;
  residentId: string;
  resident: string;
  notes: string | null;
}

export interface HouseMatch {
  houseId: string;
  code: string;
  residentId: string | null;
  resident: string | null;
}

export interface UnverifiedPaymentsRepository {
  listAlerts(): Promise<UnverifiedAlert[]>;
  listPayments(): Promise<UnverifiedPayment[]>;
  /** The alert while it still waits for review; null once it is settled. */
  getAlert(id: string): Promise<UnverifiedAlert | null>;
  /** The payment while it is still unverified; null once it is settled. */
  getPayment(id: string): Promise<UnverifiedPayment | null>;
  /** The resident a saved payer name belongs to, or null. */
  findPayerAlias(name: string): Promise<string | null>;
  /** An active house by its code, as typed, and its resident; null when no house has the code. */
  findHouse(code: string): Promise<HouseMatch | null>;
  livePermissions(profileId: string): Promise<string[]>;
  autoProcessLimit(): Promise<number | null>;
  /** Moves the alert from the review queue to processed; false when it is not waiting any more. */
  claimAlert(id: string): Promise<boolean>;
  /** Puts a claimed alert back in the review queue after a failed write. */
  releaseAlert(id: string): Promise<void>;
  /** The review fields of a processed alert, as the dashboard review queue writes them. */
  finishAlert(id: string, input: { paymentId: string; residentId: string; profileId: string }): Promise<void>;
  recordPayment(
    alert: UnverifiedAlert,
    house: { houseId: string; residentId: string },
    profileId: string
  ): Promise<{ paymentId: string } | { error: string }>;
  /** True when the payer name was saved now, false when the resident already has it. */
  saveAlias(residentId: string, name: string, profileId: string): Promise<boolean>;
  skipAlert(id: string, reason: string, profileId: string): Promise<boolean>;
  /** Marks the payment verified; false when it is not unverified any more. */
  verifyPayment(id: string, input: { profileId: string; notes: string | null; emailTransactionId?: string }): Promise<boolean>;
  audit(entry: AuditEntry, profileId: string): Promise<void>;
}

const db = () => createAdminClient() as unknown as SupabaseClient;

const ALERT_COLUMNS = 'id, amount, transaction_date, created_at, description, reference, email_import_id';
// payment_records has two foreign keys to residents (resident_id, paid_by_resident_id): name the one.
const PAYMENT_COLUMNS =
  'id, amount, payment_date, created_at, notes, status, approval_request_id, resident_id, house:houses!payment_records_house_id_fkey(short_name, house_number), resident:residents!payment_records_resident_id_fkey(first_name, last_name)';

type Name = { first_name: string | null; last_name: string | null };
const fullName = (row: Name | null | undefined) => [row?.first_name, row?.last_name].filter(Boolean).join(' ').trim();

function toAlert(row: Record<string, unknown>): UnverifiedAlert {
  const when = (row.transaction_date as string | null) ?? (row.created_at as string);
  return {
    id: row.id as string,
    amount: Number(row.amount) || 0,
    date: lagosDateString(new Date(when)),
    createdAt: row.created_at as string,
    description: (row.description as string | null) ?? null,
    reference: (row.reference as string | null) ?? null,
    emailImportId: row.email_import_id as string,
    transactionDate: (row.transaction_date as string | null) ?? null,
  };
}

/** A resident's payment report waits in Approvals (item 5), so it is not in this list. */
const isReport = (row: Record<string, unknown>) => row.status === 'pending' && !!row.approval_request_id;

function toPayment(row: Record<string, unknown>): UnverifiedPayment {
  const house = embed(row.house as { short_name: string | null; house_number: string | null } | null);
  return {
    id: row.id as string,
    amount: Number(row.amount) || 0,
    date: row.payment_date as string,
    createdAt: (row.created_at as string | null) ?? '',
    houseCode: house?.short_name || house?.house_number || 'No house',
    residentId: row.resident_id as string,
    resident: fullName(embed(row.resident as Name | null)) || 'Unknown resident',
    notes: (row.notes as string | null) ?? null,
  };
}

export function createUnverifiedPaymentsRepository(): UnverifiedPaymentsRepository {
  return {
    async listAlerts() {
      const { data, error } = await db()
        .from('email_transactions')
        .select(ALERT_COLUMNS)
        .eq('status', 'queued_for_review')
        .eq('transaction_type', 'credit')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map(toAlert);
    },

    async listPayments() {
      const { data, error } = await db()
        .from('payment_records')
        .select(PAYMENT_COLUMNS)
        .eq('is_verified', false)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).filter((row) => !isReport(row)).map(toPayment);
    },

    async getAlert(id) {
      const { data, error } = await db()
        .from('email_transactions')
        .select(ALERT_COLUMNS)
        .eq('id', id)
        .eq('status', 'queued_for_review')
        .eq('transaction_type', 'credit')
        .maybeSingle();
      if (error) throw error;
      return data ? toAlert(data) : null;
    },

    async getPayment(id) {
      const { data, error } = await db().from('payment_records').select(PAYMENT_COLUMNS).eq('id', id).eq('is_verified', false).maybeSingle();
      if (error) throw error;
      return data && !isReport(data) ? toPayment(data) : null;
    },

    async findPayerAlias(name) {
      const { data, error } = await db()
        .from('resident_payment_aliases')
        .select('resident:residents(first_name, last_name)')
        .ilike('alias_name', sanitizeSearchInput(name))
        .eq('is_active', true)
        .limit(1);
      if (error) throw error;
      const row = data?.[0];
      return row ? fullName(embed(row.resident as unknown as Name | null)) || null : null;
    },

    async findHouse(code) {
      const { data: house, error } = await db()
        .from('houses')
        .select('id, short_name')
        .eq('is_active', true)
        .ilike('short_name', sanitizeSearchInput(code.trim()))
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!house) return null;
      // resident_houses has two foreign keys to residents (resident_id, sponsor_resident_id): name the one.
      const { data: links, error: linkError } = await db()
        .from('resident_houses')
        .select('resident_id, resident_role, resident:residents!resident_houses_resident_id_fkey(first_name, last_name)')
        .eq('house_id', house.id)
        .eq('is_active', true)
        .in('resident_role', HOUSE_RESIDENT_ROLES);
      if (linkError) throw linkError;
      const picked = [...(links ?? [])].sort(
        (a, b) => HOUSE_RESIDENT_ROLES.indexOf(a.resident_role as string) - HOUSE_RESIDENT_ROLES.indexOf(b.resident_role as string)
      )[0];
      return {
        houseId: house.id as string,
        code: house.short_name as string,
        residentId: (picked?.resident_id as string | undefined) ?? null,
        resident: picked ? fullName(embed(picked.resident as unknown as Name | null)) || 'Unknown resident' : null,
      };
    },

    async livePermissions(profileId) {
      return (await loadLiveReviewer(profileId)).permissions;
    },

    autoProcessLimit: readEmailAutoProcessLimit,

    async claimAlert(id) {
      const { data, error } = await db()
        .from('email_transactions')
        .update({ status: 'processed', processed_at: new Date().toISOString() })
        .eq('id', id)
        .eq('status', 'queued_for_review')
        .select('id');
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },

    async releaseAlert(id) {
      const { error } = await db().from('email_transactions').update({ status: 'queued_for_review', processed_at: null }).eq('id', id).eq('status', 'processed');
      if (error) console.error('[whatsapp-admin] Could not put the bank alert back in the review queue:', { id, error: error.message });
    },

    async finishAlert(id, { paymentId, residentId, profileId }) {
      const now = new Date().toISOString();
      const { error } = await db()
        .from('email_transactions')
        .update({
          payment_id: paymentId,
          matched_resident_id: residentId,
          match_confidence: 'manual',
          match_method: 'manual',
          reviewed_by: profileId,
          reviewed_at: now,
          review_notes: 'WhatsApp admin',
        })
        .eq('id', id);
      if (error) throw error;
    },

    async recordPayment(alert, house, profileId) {
      // The same payment the dashboard review queue records, but verified: the alert is the bank proof.
      const result = await createPaymentAsAdmin(
        {
          resident_id: house.residentId,
          house_id: house.houseId,
          amount: alert.amount,
          payment_date: alert.transactionDate ? new Date(alert.transactionDate) : new Date(),
          status: 'paid',
          method: 'bank_transfer',
          reference_number: alert.reference || undefined,
          notes: `Email import: ${alert.description}`,
          email_import_id: alert.emailImportId,
          email_transaction_id: alert.id,
          // The admin matched the sender to this resident; no purpose is known: Dues (#1190).
          charge_category: DEFAULT_CHARGE_CATEGORY,
          paid_by_resident_id: house.residentId,
          is_verified: true,
        },
        profileId,
        WHATSAPP_ADMIN_CHANNEL
      );
      if (!result.success || !result.data) return { error: result.error || 'Failed to create payment' };
      return { paymentId: result.data.id };
    },

    async saveAlias(residentId, name, profileId) {
      const { data: existing, error } = await db()
        .from('resident_payment_aliases')
        .select('id')
        .eq('resident_id', residentId)
        .ilike('alias_name', sanitizeSearchInput(name))
        .maybeSingle();
      if (error) throw error;
      if (existing) return false;
      const { error: insertError } = await db().from('resident_payment_aliases').insert({
        resident_id: residentId,
        alias_name: name,
        notes: 'Saved from WhatsApp Admin tools',
        is_active: true,
        created_by: profileId,
      });
      if (insertError) throw insertError;
      return true;
    },

    async skipAlert(id, reason, profileId) {
      const { data, error } = await db()
        .from('email_transactions')
        .update({ status: 'skipped', skip_reason: reason, reviewed_by: profileId, reviewed_at: new Date().toISOString() })
        .eq('id', id)
        .eq('status', 'queued_for_review')
        .select('id');
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },

    async verifyPayment(id, { profileId, notes, emailTransactionId }) {
      const { data, error } = await db()
        .from('payment_records')
        .update({
          is_verified: true,
          verified_at: new Date().toISOString(),
          verified_by: profileId,
          notes,
          ...(emailTransactionId ? { email_transaction_id: emailTransactionId } : {}),
        })
        .eq('id', id)
        .eq('is_verified', false)
        // A resident's report is settled in Approvals (item 5), never here.
        .or('status.neq.pending,approval_request_id.is.null')
        .select('id');
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },

    async audit(entry, profileId) {
      await recordAudit({ ...entry, metadata: { ...entry.metadata, ...WHATSAPP_ADMIN_CHANNEL } }, { userId: profileId });
    },
  };
}
