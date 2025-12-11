'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { PaymentSearchParams } from '@/lib/validators/payment';

export async function getPayments(params: PaymentSearchParams) {
  const supabase = await createServerSupabaseClient();
  const { status, resident_id, query: searchQuery, start_date, end_date, page = 1, limit = 20 } = params;

  let query = supabase
    .from('payment_records')
    .select(`
      *,
      resident:residents!inner(
        id,
        first_name,
        last_name,
        resident_code,
        resident_houses!resident_id(
            house:houses(
                house_number,
                street:streets(name)
            )
        )
      )
    `, { count: 'exact' });

  if (status) query = query.eq('status', status);
  if (resident_id) query = query.eq('resident_id', resident_id);
  if (searchQuery) query = query.ilike('reference_number', `%${searchQuery}%`);
  if (start_date) query = query.gte('payment_date', start_date);
  if (end_date) query = query.lte('payment_date', end_date);

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  query = query.range(from, to).order('payment_date', { ascending: false });

  const { data, error, count } = await query;

  if (error) {
    console.error('Fetch payments error:', JSON.stringify(error, null, 2));
    if (Object.keys(error).length === 0) {
      console.error('Empty error object received. This might indicate a network issue or a missing relationship definition in the query.');
    }
    return { error: 'Failed to fetch payments', data: [], count: 0 };
  }

  return { data, count: count ?? 0, error: null };
}
