/**
 * Auto-record matched bank-alert credits on the scheduled fetch-emails run (service-role
 * library, NOT a server action) (#1340, owner decision 30 Oct 2026, reversing #879 option B).
 *
 * A credit becomes a payment with no admin step only when all of these hold; everything else is
 * left for `queueEmailTransactionsForReview`:
 * - high-confidence alias or phone match to a resident (the `processEmailTransactions` rule);
 * - amount at or below the live `email_import_auto_process_limit` setting (fail closed on a bad read);
 * - it came from a transaction alert, not a statement;
 * - the credited account is exactly one active estate account (`isEstateAccount`), else it is queued with the reason;
 * - the message passed the sender check (`sender-check.ts`), else it is queued with the reason;
 * - no duplicate payment exists.
 *
 * Deliberately has no server-action directive and no auth: it uses the service-role client and
 * is only called by the CRON_SECRET cron route. Exporting it from a server-action file would make
 * it a public endpoint (#561).
 */

import { createAdminClient } from '@/lib/supabase/server';
import { getSettingResultAsService } from '@/lib/settings/service';
import { checkDuplicateGuardrail } from '@/lib/matching/duplicate-matcher';
import { createPaymentAsSystem } from '@/lib/payments/create-payment';
import { notifyAdmins } from '@/lib/notifications/admin-notifier';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { DEFAULT_CHARGE_CATEGORY } from '@/lib/billing/charge-categories';
import {
  EMAIL_AUTO_PROCESS_LIMIT_KEY,
  EMAIL_AUTO_PROCESS_LIMIT_NGN,
  exceedsEmailAutoProcessLimit,
  isValidEmailAutoProcessLimit,
} from '@/lib/email-imports/utils';

export const AUTO_RECORD_SOURCE = 'cron:fetch-emails';

/**
 * The current auto-process limit, read with the service reader because the
 * fetch-emails cron has no user session. Returns null when the read failed or
 * the stored value is invalid, which callers treat as "every credit is over
 * the limit": a failed read must never raise it.
 */
export async function readEmailAutoProcessLimit(): Promise<number | null> {
  const result = await getSettingResultAsService(EMAIL_AUTO_PROCESS_LIMIT_KEY);
  if (result.status === 'absent') return EMAIL_AUTO_PROCESS_LIMIT_NGN;
  if (result.status === 'error') {
    console.error(
      `[email-imports] could not read "${EMAIL_AUTO_PROCESS_LIMIT_KEY}"; queueing every credit for review:`,
      result.message
    );
    return null;
  }
  if (!isValidEmailAutoProcessLimit(result.value)) {
    console.error(
      `[email-imports] invalid "${EMAIL_AUTO_PROCESS_LIMIT_KEY}" value; queueing every credit for review:`,
      result.value
    );
    return null;
  }
  return result.value;
}

/** The match a transaction needs before it may become a payment with no admin step. */
export function isAutoProcessMatch(tx: { match_confidence: string | null; match_method: string | null }): boolean {
  return tx.match_confidence === 'high' && (tx.match_method === 'alias' || tx.match_method === 'phone');
}

type AdminClient = Awaited<ReturnType<typeof createAdminClient>>;

type GateMessage = { email_type: string | null; sender_verified: boolean | null; sender_check: string | null } | null;

/** Why a credit failed the gate below; `reviewReason` is written to email_transactions.review_reason. */
export interface AutoRecordGateFailure {
  check: 'not_alert' | 'estate_account' | 'sender';
  reviewReason: string;
}

/**
 * The source gate a credit must pass before it may become a payment with no admin step, shared by
 * this scheduled step and the manual `processEmailTransactions` (#1353): it came from a transaction
 * alert, not a statement; the credited account is exactly one active estate account
 * (`isEstateAccount`); and the message passed the sender check. Returns null when it passes.
 */
export function checkAutoRecordGate(
  tx: { bank_account_last4: string | null; email_messages: GateMessage },
  estateAccounts: readonly string[]
): AutoRecordGateFailure | null {
  if (tx.email_messages?.email_type !== 'transaction_alert') {
    return { check: 'not_alert', reviewReason: 'Not a transaction alert' };
  }
  if (!isEstateAccount(tx.bank_account_last4, estateAccounts)) {
    return { check: 'estate_account', reviewReason: 'Credited account is not an estate account' };
  }
  if (tx.email_messages.sender_verified !== true) {
    return { check: 'sender', reviewReason: `Sender check failed: ${tx.email_messages.sender_check ?? 'not checked'}` };
  }
  return null;
}

/**
 * Whether the parsed account (`email_transactions.bank_account_last4`) is exactly one of the
 * active estate accounts (#1356). Two stored forms are accepted:
 * - masked, as FirstBank alerts show it (`202XXXX725`): the visible leading and trailing digits
 *   must match and the total length must be the same;
 * - the older last-4-digit form (`1234`): the account must end with those digits.
 * No match, or more than one, is not an estate account. Any other value fails closed, including a
 * mask that shows fewer than 4 digits in all.
 */
export function isEstateAccount(stored: string | null, estateAccounts: readonly string[]): boolean {
  if (!stored) return false;
  const value = stored.trim().toUpperCase();
  let matches: (account: string) => boolean;
  const masked = value.match(/^(\d+)[X*]+(\d+)$/);
  if (/^\d{4}$/.test(value)) {
    matches = (account) => account.endsWith(value);
  } else if (masked && masked[1].length + masked[2].length >= 4) {
    const [, head, tail] = masked;
    matches = (account) => account.length === value.length && account.startsWith(head) && account.endsWith(tail);
  } else {
    return false;
  }
  return estateAccounts.filter(matches).length === 1;
}

/** The distinct digit-only numbers of every active estate account, for `checkAutoRecordGate`. */
export async function readEstateAccountNumbers(
  client: AdminClient
): Promise<{ accounts: string[]; error: null } | { accounts: null; error: string }> {
  const { data, error } = await client.from('estate_bank_accounts').select('account_number').eq('is_active', true);
  if (error) return { accounts: null, error: error.message };
  const numbers = (data ?? []).map((a) => String(a.account_number ?? '').replace(/\s/g, '')).filter((n) => /^\d+$/.test(n));
  return { accounts: [...new Set(numbers)], error: null };
}

type CandidateRow = {
  id: string;
  email_import_id: string;
  amount: number | null;
  bank_account_last4: string | null;
  transaction_type: string | null;
  transaction_date: string | null;
  reference: string | null;
  description: string | null;
  match_confidence: string | null;
  match_method: string | null;
  matched_resident_id: string | null;
  email_messages: GateMessage;
  residents: { first_name: string | null; last_name: string | null } | null;
};

export interface AutoRecordedPayment {
  transactionId: string;
  paymentId: string;
  amount: number;
  residentName: string;
  reference: string | null;
}

export interface AutoRecordResult {
  autoRecorded: AutoRecordedPayment[];
  senderRejected: number;
  skipped: number;
  errored: number;
  error: string | null;
}

export async function autoRecordEmailPayments(importId: string): Promise<AutoRecordResult> {
  const result: AutoRecordResult = { autoRecorded: [], senderRejected: 0, skipped: 0, errored: 0, error: null };
  const adminClient = await createAdminClient();

  const { data, error } = await adminClient
    .from('email_transactions')
    .select(
      'id, email_import_id, amount, bank_account_last4, transaction_type, transaction_date, reference, description, match_confidence, match_method, matched_resident_id, email_messages(email_type, sender_verified, sender_check), residents(first_name, last_name)'
    )
    .eq('email_import_id', importId)
    .eq('transaction_type', 'credit')
    .in('status', ['pending', 'matched']);

  if (error) return { ...result, error: error.message };

  const estate = await readEstateAccountNumbers(adminClient);
  if (estate.error !== null) return { ...result, error: estate.error };

  // Read once per run, so a Settings change applies from the next run.
  const limit = await readEmailAutoProcessLimit();

  for (const tx of (data ?? []) as unknown as CandidateRow[]) {
    const amount = Number(tx.amount);
    if (!isAutoProcessMatch(tx) || !tx.matched_resident_id || !(amount > 0)) continue;
    if (exceedsEmailAutoProcessLimit(tx, limit)) continue;
    const gate = checkAutoRecordGate(tx, estate.accounts);
    // A statement row is left for queueEmailTransactionsForReview, as before.
    if (gate?.check === 'not_alert') continue;
    if (gate) {
      await adminClient.from('email_transactions').update({ review_reason: gate.reviewReason }).eq('id', tx.id);
      if (gate.check === 'sender') result.senderRejected++;
      else result.skipped++;
      continue;
    }

    try {
      if (tx.transaction_date) {
        const duplicate = await checkDuplicateGuardrail(
          { amount, date: tx.transaction_date, residentId: tx.matched_resident_id, reference: tx.reference || undefined },
          'payment',
          { toleranceDays: 1, client: adminClient }
        );
        if (duplicate.isDuplicate) {
          await adminClient
            .from('email_transactions')
            .update({ status: 'skipped', skip_reason: 'Duplicate payment detected' })
            .eq('id', tx.id);
          result.skipped++;
          continue;
        }
      }

      // Claim the row first, so an overlapping run cannot record the same alert twice.
      const { data: claimed, error: claimError } = await adminClient
        .from('email_transactions')
        .update({ status: 'auto_processed', processed_at: new Date().toISOString() })
        .eq('id', tx.id)
        .in('status', ['pending', 'matched'])
        .select('id');
      if (claimError) throw new Error(claimError.message);
      if (!claimed || claimed.length === 0) continue;

      const payment = await createPaymentAsSystem(
        {
          resident_id: tx.matched_resident_id,
          amount,
          payment_date: tx.transaction_date ? new Date(tx.transaction_date) : new Date(),
          status: 'paid',
          method: 'bank_transfer',
          reference_number: tx.reference || undefined,
          notes: `Email import: ${tx.description}`,
          email_import_id: tx.email_import_id,
          email_transaction_id: tx.id,
          // The sender was matched to this resident, so they paid it; no purpose is known: Dues (#1190).
          charge_category: DEFAULT_CHARGE_CATEGORY,
          paid_by_resident_id: tx.matched_resident_id,
          // FirstBank's own alert, sender-checked: the bank has confirmed the credit.
          is_verified: true,
        },
        AUTO_RECORD_SOURCE
      );

      if (!payment.success || !payment.data) {
        await adminClient
          .from('email_transactions')
          .update({ status: 'error', error_message: payment.error || 'Failed to create payment' })
          .eq('id', tx.id);
        result.errored++;
        continue;
      }

      await adminClient.from('email_transactions').update({ payment_id: payment.data.id }).eq('id', tx.id);
      result.autoRecorded.push({
        transactionId: tx.id,
        paymentId: payment.data.id,
        amount,
        residentName: [tx.residents?.first_name, tx.residents?.last_name].filter(Boolean).join(' ') || 'Unknown resident',
        reference: tx.reference,
      });
    } catch (txError) {
      console.error(`[email-imports] auto-record failed for transaction ${tx.id}:`, txError);
      await adminClient
        .from('email_transactions')
        .update({ status: 'error', error_message: txError instanceof Error ? txError.message : 'Auto-record failed' })
        .eq('id', tx.id);
      result.errored++;
    }
  }

  if (result.autoRecorded.length > 0) {
    const lines = result.autoRecorded.map(
      (p) => `₦${p.amount.toLocaleString('en-NG')} from ${p.residentName}${p.reference ? ` (${p.reference})` : ''}`
    );
    await notifyAdmins({
      title: 'Bank Alert Payments Recorded',
      body: `${result.autoRecorded.length} payments from import ${importId.slice(0, 8)} were recorded automatically:\n${lines.join('\n')}`,
      category: 'payment',
      actionUrl: `/payments/email-imports/${importId}`,
      priority: 'normal',
      requiredPermission: PERMISSIONS.PAYMENTS_VIEW,
    });
  }

  return result;
}
