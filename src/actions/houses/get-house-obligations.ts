'use server';

import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { buildHouseObligations, type HouseObligations, type ObligationInvoice } from '@/lib/billing/house-obligations';

export type HouseObligationsView = HouseObligations & {
  duesPaidByLandlord: boolean;
  duesReminderTarget: string;
};

/**
 * The house view of obligations by role (#1196): occupant dues and landlord levies, who owes what and
 * who paid. Read with the caller's own client, so what it returns follows their billing access.
 */
export async function getHouseObligations(houseId: string): Promise<{ data: HouseObligationsView | null; error: string | null }> {
  if (!z.string().uuid().safeParse(houseId).success) return { data: null, error: 'Invalid house' };
  const supabase = await createServerSupabaseClient();

  const [house, links, invoices, payments, categories] = await Promise.all([
    supabase.from('houses').select('id, property_status, is_new_never_occupied, dues_paid_by_landlord, dues_reminder_target').eq('id', houseId).single(),
    supabase.from('resident_houses').select('resident_id, resident_role').eq('house_id', houseId).eq('is_active', true),
    supabase
      .from('invoices')
      .select('resident_id, charge_category, amount_due, amount_paid, billing_profile:billing_profiles(payer)')
      .eq('house_id', houseId)
      .neq('status', 'void'),
    supabase
      .from('payment_records')
      .select('resident_id, amount, payment_date, paid_by_resident_id, paid_by_name')
      .eq('house_id', houseId)
      .eq('status', 'paid'),
    supabase.from('charge_categories').select('code, name').order('sort_order', { ascending: true }),
  ]);
  const failed = house.error || links.error || invoices.error || payments.error || categories.error;
  if (failed) {
    console.error('[house-obligations] read failed', { houseId, error: failed });
    return { data: null, error: failed.message };
  }

  const obligationInvoices = (invoices.data || []).map<ObligationInvoice>((invoice) => {
    const profile = (Array.isArray(invoice.billing_profile) ? invoice.billing_profile[0] : invoice.billing_profile) as { payer: string } | null;
    return {
      resident_id: invoice.resident_id,
      charge_category: invoice.charge_category,
      amount_due: Number(invoice.amount_due) || 0,
      amount_paid: Number(invoice.amount_paid) || 0,
      payer: profile?.payer === 'landlord' || profile?.payer === 'occupant' ? profile.payer : null,
    };
  });
  const obligationPayments = (payments.data || []).map((payment) => ({
    resident_id: payment.resident_id,
    amount: Number(payment.amount) || 0,
    payment_date: payment.payment_date,
    paid_by_resident_id: payment.paid_by_resident_id,
    paid_by_name: payment.paid_by_name,
  }));
  const parties = (links.data || []).map((link) => ({ id: link.resident_id, role: String(link.resident_role) }));

  const ids = [...new Set([
    ...parties.map((party) => party.id),
    ...obligationInvoices.map((invoice) => invoice.resident_id),
    ...obligationPayments.flatMap((payment) => [payment.resident_id, payment.paid_by_resident_id]),
  ].filter((id): id is string => Boolean(id)))];
  const residents = ids.length > 0
    ? await supabase.from('residents').select('id, first_name, last_name, entity_type, company_name').in('id', ids)
    : { data: [], error: null };
  if (residents.error) return { data: null, error: residents.error.message };
  const names = new Map((residents.data || []).map((resident) => [
    resident.id,
    resident.entity_type === 'corporate' && resident.company_name ? resident.company_name : `${resident.first_name} ${resident.last_name}`.trim(),
  ]));

  const obligations = buildHouseObligations({
    house: { vacant: house.data.property_status === 'vacant', newNeverOccupied: house.data.is_new_never_occupied === true },
    parties,
    invoices: obligationInvoices,
    payments: obligationPayments,
    categories: categories.data || [],
    names,
  });
  return {
    data: {
      ...obligations,
      duesPaidByLandlord: house.data.dues_paid_by_landlord === true,
      duesReminderTarget: house.data.dues_reminder_target,
    },
    error: null,
  };
}
