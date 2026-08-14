import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
dotenv.config({ path: '.env.local' });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL_CLOUD;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY_CLOUD;
if (!url || !key) throw new Error('Cloud Supabase configuration is unavailable.');
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const residentId = '8db20966-36e4-524f-aed6-2aee7605eceb';
async function main() {
  const [invoices, payments, wallet, residentHouses] = await Promise.all([
    supabase.from('invoices').select('id,invoice_number,period_start,amount_due,amount_paid,status').eq('resident_id', residentId).order('period_start'),
    supabase.from('payment_records').select('id,amount,payment_date,reference_number').eq('resident_id', residentId).order('payment_date'),
    supabase.from('resident_wallets').select('id,balance').eq('resident_id', residentId).single(),
    supabase.from('resident_houses').select('move_in_date').eq('resident_id', residentId).eq('is_primary', true).order('move_in_date').limit(1),
  ]);
  if (invoices.error) throw invoices.error;
  if (payments.error) throw payments.error;
  if (wallet.error) throw wallet.error;
  if (residentHouses.error) throw residentHouses.error;
  const tx = await supabase.from('wallet_transactions').select('id,type,amount,balance_after,reference_type,reference_id,created_at,description').eq('wallet_id', wallet.data.id).order('created_at').order('id');
  if (tx.error) throw tx.error;
  const years = new Map<number, { credits: number; debits: number; tx: typeof tx.data; invoices: number; invoiceTotal: number; paidTotal: number }>();
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;
  const moveInDate = residentHouses.data?.[0]?.move_in_date ? new Date(residentHouses.data[0].move_in_date) : null;
  const moveInYear = moveInDate?.getFullYear() ?? null;
  const moveInMonth = moveInDate ? moveInDate.getMonth() + 1 : 1;
  const invoiceTotalByYear = new Map<number, number>();
  for (const year of [2020, 2021, 2022, 2023, 2024, 2025]) years.set(year, { credits: 0, debits: 0, tx: [], invoices: 0, invoiceTotal: 0, paidTotal: 0 });
  for (const row of tx.data ?? []) {
    const year = Number(row.created_at.slice(0, 4));
    const item = years.get(year); if (!item) continue;
    item.tx.push(row);
    if (row.type === 'credit') item.credits += Number(row.amount); else item.debits += Number(row.amount);
  }
  for (const row of invoices.data ?? []) {
    const year = Number(row.period_start.slice(0, 4));
    const item = years.get(year); if (!item) continue;
    item.invoices += 1; item.invoiceTotal += Number(row.amount_due); item.paidTotal += Number(row.amount_paid);
    const month = new Date(row.period_start).getMonth() + 1;
    if (year <= currentYear && !(year === currentYear && month > currentMonth) && !(moveInYear !== null && year === moveInYear && month < moveInMonth)) {
      invoiceTotalByYear.set(year, (invoiceTotalByYear.get(year) ?? 0) + Number(row.amount_due));
    }
  }
  let runningBalance = 0;
  const openingBalanceByYear = new Map<number, number>();
  const creditsByYear = new Map<number, number>();
  for (const row of tx.data ?? []) {
    const year = Number(row.created_at.slice(0, 4));
    if (!openingBalanceByYear.has(year)) openingBalanceByYear.set(year, runningBalance);
    if (row.type === 'credit') {
      creditsByYear.set(year, (creditsByYear.get(year) ?? 0) + Number(row.amount));
      runningBalance += Number(row.amount);
    } else runningBalance -= Number(row.amount);
  }
  console.log(JSON.stringify({ wallet: wallet.data, move_in_date: residentHouses.data?.[0]?.move_in_date ?? null, payments: payments.data, years: [...years.entries()].map(([year, item]) => { const annualGap = (invoiceTotalByYear.get(year) ?? 0) - (creditsByYear.get(year) ?? 0); return { year, credits: item.credits, debits: item.debits, net: item.credits - item.debits, outstanding_debit: annualGap < 0 ? Math.abs(annualGap) : Math.max(0, annualGap - Math.max(0, openingBalanceByYear.get(year) ?? 0)), first: item.tx[0] ?? null, last: item.tx.at(-1) ?? null, invoice_count: item.invoices, invoice_total: item.invoiceTotal, invoice_paid: item.paidTotal }; }), transactions_2020_2025: (tx.data ?? []).filter((row) => Number(row.created_at.slice(0, 4)) >= 2020 && Number(row.created_at.slice(0, 4)) <= 2025) }, null, 2));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
