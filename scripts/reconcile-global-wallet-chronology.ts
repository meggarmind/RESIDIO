/** Rebuild imported legacy invoice allocations without crossing calendar years. */
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL_CLOUD;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY_CLOUD;
if (!url || !key) throw new Error('Cloud Supabase configuration is unavailable.');
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const apply = process.argv.includes('--apply');

function deterministicUuid(seed: string) {
  const digest = crypto.createHash('sha1').update(`residio:wallet-chronology:${seed}`).digest();
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = digest.toString('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function main() {
  const [wallets, invoices, transactions] = await Promise.all([
    supabase.from('resident_wallets').select('id,resident_id,balance'),
    supabase.from('invoices').select('id,resident_id,invoice_number,amount_due,period_start,status,amount_paid').like('invoice_number', 'LEGACY-%').order('period_start'),
    supabase.from('wallet_transactions').select('id,wallet_id,type,amount,reference_type,reference_id,created_at,description').order('created_at').order('id'),
  ]);
  for (const result of [wallets, invoices, transactions]) if (result.error) throw result.error;

  const walletRows = wallets.data ?? [];
  const invoiceRows = invoices.data ?? [];
  const transactionRows = transactions.data ?? [];
  const walletByResident = new Map(walletRows.map((wallet) => [wallet.resident_id, wallet]));
  const invoicesByResident = new Map<string, typeof invoiceRows>();
  for (const invoice of invoiceRows) {
    const list = invoicesByResident.get(invoice.resident_id) ?? [];
    list.push(invoice);
    invoicesByResident.set(invoice.resident_id, list);
  }

  const plans = [] as Array<{ residentId: string; walletId: string; invoiceChanges: number; debitUpdates: number; debitInserts: number; debitDeletes: number; balance: number; debitTotal: number; creditTotal: number; futureYearDebitsBefore: number; futureYearDebitsAfter: number }>;
  for (const [residentId, residentInvoices] of invoicesByResident) {
    const wallet = walletByResident.get(residentId);
    if (!wallet) continue;
    const walletTransactions = transactionRows.filter((transaction) => transaction.wallet_id === wallet.id);
    const residentInvoiceIds = new Set(residentInvoices.map((invoice) => invoice.id));
    const legacyDebits = walletTransactions.filter((transaction) => transaction.type === 'debit' && transaction.reference_type === 'invoice' && residentInvoiceIds.has(transaction.reference_id ?? '') && ((transaction.description ?? '').startsWith('FIFO allocation for LEGACY-') || (transaction.description ?? '').startsWith('FIFO allocation for legacy chronological reconciliation')));
    const credits = walletTransactions.filter((transaction) => transaction.type === 'credit').sort((a, b) => `${a.created_at}:${a.id}`.localeCompare(`${b.created_at}:${b.id}`));
    if (!legacyDebits.length || !credits.length) continue;

    const remaining = new Map(residentInvoices.map((invoice) => [invoice.id, Number(invoice.amount_due)]));
    const desired = new Map<string, { amount: number; createdAt: string }>();
    let balance = 0;
    for (const credit of credits) {
      balance += Number(credit.amount);
      const creditYear = credit.created_at.slice(0, 4);
      let sequence = 0;
      for (const invoice of residentInvoices) {
        const due = remaining.get(invoice.id) ?? 0;
        if (due <= 0 || invoice.period_start.slice(0, 4) > creditYear || balance <= 0) continue;
        const amount = Math.min(balance, due);
        balance -= amount;
        remaining.set(invoice.id, due - amount);
        desired.set(invoice.id, { amount, createdAt: `${credit.created_at.slice(0, 10)}T00:00:01.${String(sequence++).padStart(3, '0')}Z` });
      }
    }

    const existingByInvoice = new Map(legacyDebits.map((debit) => [debit.reference_id, debit]));
    const duplicateIds = new Set<string>();
    for (const debit of legacyDebits) {
      if (existingByInvoice.get(debit.reference_id)?.id !== debit.id) duplicateIds.add(debit.id);
    }
    const obsolete = legacyDebits.filter((debit) => !desired.has(debit.reference_id) || duplicateIds.has(debit.id));
    let invoiceChanges = 0;
    for (const invoice of residentInvoices) {
      const amountPaid = desired.get(invoice.id)?.amount ?? 0;
      if (Number(invoice.amount_paid) !== amountPaid || invoice.status !== (amountPaid >= Number(invoice.amount_due) ? 'paid' : 'unpaid')) invoiceChanges++;
    }

    const futureBefore = legacyDebits.filter((debit) => {
      const invoice = residentInvoices.find((item) => item.id === debit.reference_id);
      return invoice && debit.created_at.slice(0, 4) < invoice.period_start.slice(0, 4);
    }).length;
    const futureAfter = [...desired].filter(([invoiceId, allocation]) => {
      const invoice = residentInvoices.find((item) => item.id === invoiceId)!;
      return allocation.createdAt.slice(0, 4) < invoice.period_start.slice(0, 4);
    }).length;
    const plan = { residentId, walletId: wallet.id, invoiceChanges, debitUpdates: 0, debitInserts: 0, debitDeletes: obsolete.length, balance, debitTotal: 0, creditTotal: credits.reduce((sum, credit) => sum + Number(credit.amount), 0), futureYearDebitsBefore: futureBefore, futureYearDebitsAfter: futureAfter };
    for (const [invoiceId, allocation] of desired) {
      plan.debitTotal += allocation.amount;
      const existing = existingByInvoice.get(invoiceId);
      if (existing) {
        if (Number(existing.amount) !== allocation.amount || existing.created_at.slice(0, 10) !== allocation.createdAt.slice(0, 10)) plan.debitUpdates++;
      } else plan.debitInserts++;
    }
    plans.push(plan);

    if (!apply) continue;
    for (const invoice of residentInvoices) {
      const amountPaid = desired.get(invoice.id)?.amount ?? 0;
      const status = amountPaid >= Number(invoice.amount_due) ? 'paid' : 'unpaid';
      const result = await supabase.from('invoices').update({ amount_paid: amountPaid, status }).eq('id', invoice.id);
      if (result.error) throw result.error;
    }
    for (const [invoiceId, allocation] of desired) {
      const existing = existingByInvoice.get(invoiceId);
      const values = { amount: allocation.amount, created_at: allocation.createdAt, balance_after: 0 };
      if (existing) {
        const result = await supabase.from('wallet_transactions').update(values).eq('id', existing.id);
        if (result.error) throw result.error;
      } else {
        const result = await supabase.from('wallet_transactions').insert({ id: deterministicUuid(`${wallet.id}:${invoiceId}`), wallet_id: wallet.id, type: 'debit', amount: allocation.amount, balance_after: 0, reference_type: 'invoice', reference_id: invoiceId, description: 'FIFO allocation for legacy chronological reconciliation', created_at: allocation.createdAt });
        if (result.error) throw result.error;
      }
    }
    for (const debit of obsolete) {
      const result = await supabase.from('wallet_transactions').delete().eq('id', debit.id);
      if (result.error) throw result.error;
    }
    const legacyDebitIds = new Set(legacyDebits.map((debit) => debit.id));
    const ordered = walletTransactions
      .filter((transaction) => !legacyDebitIds.has(transaction.id))
      .map((transaction) => ({ id: transaction.id, type: transaction.type, amount: Number(transaction.amount), created_at: transaction.created_at }));
    for (const [invoiceId, allocation] of desired) {
      const existing = existingByInvoice.get(invoiceId);
      ordered.push({ id: existing?.id ?? deterministicUuid(`${wallet.id}:${invoiceId}`), type: 'debit', amount: allocation.amount, created_at: allocation.createdAt });
    }
    ordered.sort((a, b) => `${a.created_at}:${a.id}`.localeCompare(`${b.created_at}:${b.id}`));
    let running = 0;
    for (const transaction of ordered) {
      running += transaction.type === 'credit' ? Number(transaction.amount) : -Number(transaction.amount);
      await supabase.from('wallet_transactions').update({ balance_after: running }).eq('id', transaction.id);
    }
    const walletUpdate = await supabase.from('resident_wallets').update({ balance: running }).eq('id', wallet.id);
    if (walletUpdate.error) throw walletUpdate.error;
  }

  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', targeted_residents: plans.length, totals: plans.reduce((total, plan) => ({ invoice_changes: total.invoice_changes + plan.invoiceChanges, debit_updates: total.debit_updates + plan.debitUpdates, debit_inserts: total.debit_inserts + plan.debitInserts, debit_deletes: total.debit_deletes + plan.debitDeletes, future_year_debits_before: total.future_year_debits_before + plan.futureYearDebitsBefore, future_year_debits_after: total.future_year_debits_after + plan.futureYearDebitsAfter }), { invoice_changes: 0, debit_updates: 0, debit_inserts: 0, debit_deletes: 0, future_year_debits_before: 0, future_year_debits_after: 0 }), residents: plans }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
