import type { SupabaseClient } from '@supabase/supabase-js';
import type { CollectionsStatementSection } from '@/lib/billing/account-statement-data';
import { buildCollectionsSection, type CollectionPaymentRow } from '@/lib/billing/statement-categories';
import { payerName, type CollectionPayer } from '@/lib/collections/ledger';

/**
 * The statement an admin prints for one collection payer (#1196), resident or not: every payment the
 * payer made into any collection in the period, with a total. A reversed payment counts for nothing and
 * is left out. Reading needs collections.view, which the collection tables' RLS enforces.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface CollectionsStatementData {
  payer: { id: string; name: string; phone: string | null; email: string | null; isResident: boolean; residentCode: string | null };
  period: { from: string; to: string };
  collections: CollectionsStatementSection;
  generatedAt: string;
}

export async function loadCollectionsStatement(
  client: SupabaseClient,
  { payerId, fromDate, toDate }: { payerId: string; fromDate: string; toDate: string }
): Promise<{ data: CollectionsStatementData | null; error: string | null }> {
  const valid = (date: string) => ISO_DATE.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
  if (!valid(fromDate) || !valid(toDate)) return { data: null, error: 'Dates must be in YYYY-MM-DD format' };

  const { data: payer, error: payerError } = await client
    .from('collection_payers')
    .select('id, resident_id, full_name, phone, email, resident:residents(first_name, last_name, resident_code, phone_primary, email)')
    .eq('id', payerId)
    .maybeSingle();
  if (payerError) return { data: null, error: payerError.message };
  if (!payer) return { data: null, error: 'Payer not found' };

  const { data: payments, error } = await client
    .from('collection_payments')
    .select('id, amount, quantity, unit_price, payment_date, reference, receipt_number, collection:collections!collection_id(name)')
    .eq('payer_id', payerId)
    .is('reversed_at', null)
    .gte('payment_date', fromDate)
    .lte('payment_date', toDate)
    .order('payment_date', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return { data: null, error: error.message };

  const resident = (Array.isArray(payer.resident) ? payer.resident[0] : payer.resident) as
    | { first_name: string | null; last_name: string | null; resident_code: string | null; phone_primary: string | null; email: string | null }
    | null;
  return {
    data: {
      payer: {
        id: payer.id,
        name: payerName({ full_name: payer.full_name, resident } as Pick<CollectionPayer, 'full_name' | 'resident'>),
        phone: resident?.phone_primary ?? payer.phone,
        email: resident?.email ?? payer.email,
        isResident: Boolean(payer.resident_id),
        residentCode: resident?.resident_code ?? null,
      },
      period: { from: fromDate, to: toDate },
      collections: buildCollectionsSection((payments || []) as unknown as CollectionPaymentRow[]) ?? { lines: [], total: 0 },
      generatedAt: new Date().toISOString(),
    },
    error: null,
  };
}
