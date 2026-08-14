import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
dotenv.config({ path: '.env.local' });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL_CLOUD;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY_CLOUD;
if (!url || !key) throw new Error('Cloud Supabase configuration is unavailable.');
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
async function main() {
  const [wallets, invoices, transactions] = await Promise.all([
    supabase.from('resident_wallets').select('id,resident_id,balance'),
    supabase.from('invoices').select('id,period_start'),
    supabase.from('wallet_transactions').select('wallet_id,type,amount,reference_type,reference_id,created_at'),
  ]);
  for (const result of [wallets, invoices, transactions]) if (result.error) throw result.error;
  const invoiceById = new Map((invoices.data ?? []).map((invoice) => [invoice.id, invoice]));
  const futureInvoiceDebits = (transactions.data ?? []).filter((transaction) => {
    const invoice = transaction.type === 'debit' && transaction.reference_type === 'invoice' ? invoiceById.get(transaction.reference_id ?? '') : null;
    return Boolean(invoice && transaction.created_at.slice(0, 4) < invoice.period_start.slice(0, 4));
  });
  const balanceMismatches = (wallets.data ?? []).map((wallet) => {
    const rows = (transactions.data ?? []).filter((transaction) => transaction.wallet_id === wallet.id);
    const calculated = rows.reduce((balance, transaction) => balance + (transaction.type === 'credit' ? Number(transaction.amount) : -Number(transaction.amount)), 0);
    return { wallet_id: wallet.id, stored: Number(wallet.balance), calculated };
  }).filter((row) => row.stored !== row.calculated);
  console.log(JSON.stringify({ wallets: wallets.data?.length ?? 0, invoices: invoices.data?.length ?? 0, transactions: transactions.data?.length ?? 0, future_invoice_debits: futureInvoiceDebits.length, wallet_balance_mismatches: balanceMismatches.length, balance_mismatch_sample: balanceMismatches.slice(0, 10) }, null, 2));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
