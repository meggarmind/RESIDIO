/**
 * Reconcile explicit tracker credits and legacy payment credits into resident wallets.
 *
 * Dry-run by default. Use --apply only after reviewing the proposed totals.
 * The deterministic reference IDs make the operation safe to re-run.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL_CLOUD;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY_CLOUD;
if (!url || !key) throw new Error('Cloud Supabase configuration is unavailable.');

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const apply = process.argv.includes('--apply');
const today = new Date().toISOString().slice(0, 10);

type CreditPlan = {
  referenceId: string;
  residentId: string;
  houseId: string;
  ledgerId: string;
  street: string;
  houseLabel: string;
  sourceYear: string;
  amount: number;
  description: string;
  referenceType: 'legacy_tracker_credit' | 'payment';
};

function deterministicUuid(seed: string): string {
  const digest = crypto.createHash('sha1').update(`residio:legacy-wallet:${seed}`).digest();
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = digest.toString('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function parseTrackerCredits() {
  const ledger = fs.readFileSync('docs/importdata/legacy-record-ledger.md', 'utf8').split(/\r?\n/);
  const report = JSON.parse(fs.readFileSync('docs/importdata/house-reconciliation-report.json', 'utf8')) as {
    house_matches: Array<{
      id: string;
      candidates?: Array<{
        id: string;
        assignments?: Array<{ resident_id: string; is_active: boolean; is_primary: boolean }>;
      }>;
    }>;
  };

  const plans: CreditPlan[] = [];
  let current: { ledgerId: string; street: string; houseLabel: string; houseId?: string; residentId?: string } | null = null;

  for (const line of ledger) {
    const heading = line.match(/^## (L-\d+) — ([^/]+) \/ House (.+)$/);
    if (heading) {
      const match = report.house_matches.find((entry) => entry.id === heading[1]);
      const candidate = match?.candidates?.[0];
      // Some tracker rows intentionally have no active occupancy assignment. The
      // canonical primary resident is still the correct wallet owner for a
      // documented historical credit, so prefer active primary and fall back to
      // the retained historical primary.
      const assignment = candidate?.assignments?.find((item) => item.is_active && item.is_primary)
        ?? candidate?.assignments?.find((item) => item.is_primary);
      if (!candidate?.id || !assignment?.resident_id) {
        throw new Error(`No active primary mapping for ${heading[1]}.`);
      }
      current = {
        ledgerId: heading[1],
        street: heading[2].trim(),
        houseLabel: heading[3].trim(),
        houseId: candidate.id,
        residentId: assignment.resident_id,
      };
      continue;
    }

    if (!current || !/credit/i.test(line) || /Sheet total|final balance/i.test(line)) continue;
    const entry = current;
    const sourceYear = (line.match(/\b(20\d{2}|19\d{2})\b/) ?? [])[1] ?? 'undated';
    const amounts = [...line.matchAll(/\(\s*NGN\s*([\d,]+)\s*\)/gi)];
    amounts.forEach((amountMatch, index) => {
      const amount = Number(amountMatch[1].replace(/,/g, ''));
      plans.push({
        referenceId: deterministicUuid(`${entry.ledgerId}:${sourceYear}:${index}:${amount}`),
        residentId: entry.residentId!,
        houseId: entry.houseId!,
        ledgerId: entry.ledgerId,
        street: entry.street,
        houseLabel: entry.houseLabel,
        sourceYear,
        amount,
        referenceType: 'legacy_tracker_credit',
        description: `Legacy tracker credit: ${entry.street}-${entry.houseLabel}, ${sourceYear}; source ledger ${entry.ledgerId}.`,
      });
    });
  }

  return plans;
}

async function getOrCreateWallet(residentId: string) {
  const existing = await supabase.from('resident_wallets').select('id,resident_id,balance').eq('resident_id', residentId).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data;
  const created = await supabase.from('resident_wallets').insert({ resident_id: residentId, balance: 0 }).select('id,resident_id,balance').single();
  if (created.error) throw created.error;
  return created.data;
}

async function main() {
  const trackerPlans = parseTrackerCredits();
  const payments = await supabase
    .from('payment_records')
    .select('id,resident_id,amount,reference_number,notes')
    .like('reference_number', 'LEGACY-%')
    .order('reference_number');
  if (payments.error) throw payments.error;

  const paymentIds = (payments.data ?? []).map((payment) => payment.id);
  const existingPaymentTransactions = paymentIds.length
    ? await supabase.from('wallet_transactions').select('reference_id,type,amount').in('reference_id', paymentIds)
    : { data: [], error: null };
  if (existingPaymentTransactions.error) throw existingPaymentTransactions.error;
  const creditedPaymentIds = new Set(
    (existingPaymentTransactions.data ?? [])
      .filter((transaction) => transaction.type === 'credit')
      .map((transaction) => transaction.reference_id),
  );

  const paymentPlans: CreditPlan[] = (payments.data ?? [])
    .filter((payment) => !creditedPaymentIds.has(payment.id))
    .map((payment) => ({
      referenceId: payment.id,
      residentId: payment.resident_id,
      houseId: '',
      ledgerId: '',
      street: '',
      houseLabel: '',
      sourceYear: payment.reference_number,
      amount: Number(payment.amount),
      referenceType: 'payment',
      description: `Legacy payment wallet credit: ${payment.reference_number}. ${payment.notes ?? ''}`.trim(),
    }));

  const plans = [...trackerPlans, ...paymentPlans];
  const residentIds = [...new Set(plans.map((plan) => plan.residentId))];
  const wallets = residentIds.length
    ? await supabase.from('resident_wallets').select('id,resident_id,balance').in('resident_id', residentIds)
    : { data: [], error: null };
  if (wallets.error) throw wallets.error;
  const walletByResident = new Map((wallets.data ?? []).map((wallet) => [wallet.resident_id, wallet]));
  const existingLegacy = plans.length
    ? await supabase
        .from('wallet_transactions')
        .select('reference_id')
        .in('reference_id', plans.map((plan) => plan.referenceId))
    : { data: [], error: null };
  if (existingLegacy.error) throw existingLegacy.error;
  const existingReferenceIds = new Set((existingLegacy.data ?? []).map((transaction) => transaction.reference_id));
  const pending = plans.filter((plan) => !existingReferenceIds.has(plan.referenceId));

  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    tracker_credit_rows: trackerPlans.length,
    tracker_credit_total: trackerPlans.reduce((sum, plan) => sum + plan.amount, 0),
    missing_payment_credit_rows: paymentPlans.length,
    missing_payment_credit_total: paymentPlans.reduce((sum, plan) => sum + plan.amount, 0),
    existing_wallets: walletByResident.size,
    wallets_to_create: residentIds.filter((id) => !walletByResident.has(id)).length,
    pending_transactions: pending.length,
    pending_total: pending.reduce((sum, plan) => sum + plan.amount, 0),
    pending: pending.map((plan) => ({
      reference_id: plan.referenceId,
      reference_type: plan.referenceType,
      resident_id: plan.residentId,
      ledger_id: plan.ledgerId || null,
      source: plan.sourceYear,
      amount: plan.amount,
      description: plan.description,
    })),
  };

  if (!apply) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  let inserted = 0;
  for (const plan of pending) {
    let wallet = walletByResident.get(plan.residentId);
    if (!wallet) {
      wallet = await getOrCreateWallet(plan.residentId);
      walletByResident.set(plan.residentId, wallet);
    }

    const newBalance = Number(wallet.balance) + plan.amount;
    const updated = await supabase.from('resident_wallets').update({ balance: newBalance }).eq('id', wallet.id);
    if (updated.error) throw updated.error;
    const transaction = await supabase.from('wallet_transactions').insert({
      wallet_id: wallet.id,
      type: 'credit',
      amount: plan.amount,
      balance_after: newBalance,
      reference_type: plan.referenceType,
      reference_id: plan.referenceId,
      description: plan.description,
      created_at: `${today}T00:00:00.000Z`,
    });
    if (transaction.error) throw transaction.error;
    wallet = { ...wallet, balance: newBalance };
    inserted += 1;
  }

  console.log(JSON.stringify({ ...summary, inserted }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
