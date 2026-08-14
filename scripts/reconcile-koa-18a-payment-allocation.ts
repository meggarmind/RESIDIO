/** Rebuild KOA-18A allocations using payment chronology and invoice period. */
import dotenv from 'dotenv';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL_CLOUD;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY_CLOUD;
if (!url || !key) throw new Error('Cloud Supabase configuration is unavailable.');
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const apply = process.argv.includes('--apply');
const residentId = '8db20966-36e4-524f-aed6-2aee7605eceb';
const walletId = '5924b48b-0c55-4767-84fa-4683597c511e';

async function main() {
  const invoices = await supabase.from('invoices').select('*').eq('resident_id', residentId).order('period_start');
  if (invoices.error) throw invoices.error;
  const payments = await supabase.from('payment_records').select('*').eq('resident_id', residentId).order('payment_date');
  if (payments.error) throw payments.error;
  const transactions = await supabase.from('wallet_transactions').select('*').eq('wallet_id', walletId).order('created_at').order('id');
  if (transactions.error) throw transactions.error;

  const invoiceById = new Map((invoices.data ?? []).map((invoice) => [invoice.id, { ...invoice, remaining: Number(invoice.amount_due) }]));
  const desired = new Map<string, { paymentId: string; paymentDate: string; amount: number }>();
  let balance = 0;
  const txPlan: Array<{ transactionId?: string; createdAt: string; balanceAfter: number; invoiceId?: string; amount?: number; paymentId?: string }> = [];

  const credits = (transactions.data ?? []).filter((transaction) => transaction.type === 'credit');
  const debits = new Map((transactions.data ?? []).filter((transaction) => transaction.type === 'debit').map((transaction) => [transaction.reference_id, transaction]));

  for (const payment of payments.data ?? []) {
    balance += Number(payment.amount);
    const credit = credits.find((transaction) => transaction.reference_id === payment.id);
    if (credit) txPlan.push({ transactionId: credit.id, createdAt: `${payment.payment_date}T00:00:00.000Z`, balanceAfter: balance });

    let sequence = 0;
    for (const invoice of invoices.data ?? []) {
      const item = invoiceById.get(invoice.id)!;
      // Legacy tracker payments are lump sums. They may prepay the remaining
      // invoice periods within the payment year, preserving July 2020's
      // prepayment for the August 2020 first-billing period, but they must not
      // cross into a later calendar year.
      if (item.remaining <= 0 || invoice.period_start.slice(0, 4) > payment.payment_date.slice(0, 4)) continue;
      const amount = Math.min(balance, item.remaining);
      if (!amount) continue;
      balance -= amount;
      item.remaining -= amount;
      desired.set(invoice.id, { paymentId: payment.id, paymentDate: payment.payment_date, amount });
      const existing = debits.get(invoice.id);
      txPlan.push({ transactionId: existing?.id, invoiceId: invoice.id, amount, paymentId: payment.id, createdAt: `${payment.payment_date}T00:00:01.${String(sequence++).padStart(3, '0')}Z`, balanceAfter: balance });
    }
  }

  const obsoleteDebits = [...debits.values()].filter((transaction) => !desired.has(transaction.reference_id));
  const invoiceChanges = (invoices.data ?? []).map((invoice) => {
    const allocation = desired.get(invoice.id);
    const amountPaid = allocation?.amount ?? 0;
    return { id: invoice.id, invoice_number: invoice.invoice_number, from: { amount_paid: invoice.amount_paid, status: invoice.status }, to: { amount_paid: amountPaid, status: amountPaid >= Number(invoice.amount_due) ? 'paid' : 'unpaid' } };
  }).filter((change) => change.from.amount_paid !== change.to.amount_paid || change.from.status !== change.to.status);

  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    final_wallet_balance: balance,
    transaction_updates: txPlan.length,
    obsolete_debits: obsoleteDebits.map((transaction) => ({ id: transaction.id, reference_id: transaction.reference_id, description: transaction.description })),
    invoice_changes: invoiceChanges,
  };
  if (!apply) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  for (const change of invoiceChanges) {
    const result = await supabase.from('invoices').update(change.to).eq('id', change.id);
    if (result.error) throw result.error;
  }
  for (const update of txPlan) {
    if (update.transactionId) {
      const result = await supabase.from('wallet_transactions').update({ created_at: update.createdAt, balance_after: update.balanceAfter }).eq('id', update.transactionId);
      if (result.error) throw result.error;
    } else {
      const result = await supabase.from('wallet_transactions').insert({
        id: crypto.randomUUID(), wallet_id: walletId, type: 'debit', amount: update.amount,
        balance_after: update.balanceAfter, reference_type: 'invoice', reference_id: update.invoiceId,
        description: 'FIFO allocation for legacy chronological reconciliation', created_at: update.createdAt,
      });
      if (result.error) throw result.error;
    }
  }
  for (const transaction of obsoleteDebits) {
    const result = await supabase.from('wallet_transactions').delete().eq('id', transaction.id);
    if (result.error) throw result.error;
  }
  const wallet = await supabase.from('resident_wallets').update({ balance }).eq('id', walletId);
  if (wallet.error) throw wallet.error;
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
