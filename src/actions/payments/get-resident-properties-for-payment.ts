'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';

export interface ResidentPropertyForPayment {
  houseId: string;
  houseNumber: string;
  streetName: string;
  isCurrent: boolean;
  outstandingAmount: number;
  unpaidInvoiceCount: number;
}

export interface GetResidentPropertiesResult {
  data: ResidentPropertyForPayment[] | null;
  error: string | null;
  hasPreviousPropertyDebts: boolean;
}

/**
 * Get all properties a resident has been associated with, along with their outstanding amounts.
 * This includes current and previous properties with unpaid invoices.
 */
export async function getResidentPropertiesForPayment(
  residentId: string
): Promise<GetResidentPropertiesResult> {
  const supabase = await createServerSupabaseClient();

  // Get all houses this resident has been associated with (current + previous)
  const { data: residentHouses, error: rhError } = await supabase
    .from('resident_houses')
    .select(`
      house_id,
      is_active,
      house:houses(
        id,
        house_number,
        street:streets(name)
      )
    `)
    .eq('resident_id', residentId);

  if (rhError) {
    return { data: null, error: rhError.message, hasPreviousPropertyDebts: false };
  }

  if (!residentHouses || residentHouses.length === 0) {
    return { data: [], error: null, hasPreviousPropertyDebts: false };
  }

  // Track which houses are current
  const currentHouseIds = new Set(
    residentHouses.filter((rh) => rh.is_active).map((rh) => rh.house_id)
  );

  // Get all invoices for this resident grouped by house
  const { data: invoices, error: invError } = await supabase
    .from('invoices')
    .select('house_id, amount_due, amount_paid, status')
    .eq('resident_id', residentId)
    .neq('status', 'void')
    .in('status', ['unpaid', 'partially_paid', 'overdue']);

  if (invError) {
    return { data: null, error: invError.message, hasPreviousPropertyDebts: false };
  }

  // Calculate outstanding per house
  const houseOutstanding = new Map<string, { amount: number; count: number }>();

  (invoices || []).forEach((inv) => {
    if (!inv.house_id) return;
    const outstanding = (inv.amount_due || 0) - (inv.amount_paid || 0);
    if (outstanding > 0) {
      const existing = houseOutstanding.get(inv.house_id) || { amount: 0, count: 0 };
      existing.amount += outstanding;
      existing.count += 1;
      houseOutstanding.set(inv.house_id, existing);
    }
  });

  // Build the result list
  const properties: ResidentPropertyForPayment[] = [];
  const seenHouseIds = new Set<string>();

  residentHouses.forEach((rh) => {
    if (seenHouseIds.has(rh.house_id)) return;
    seenHouseIds.add(rh.house_id);

    const house = rh.house as any;
    if (!house) return;

    const outstanding = houseOutstanding.get(rh.house_id) || { amount: 0, count: 0 };
    const isCurrent = currentHouseIds.has(rh.house_id);

    properties.push({
      houseId: rh.house_id,
      houseNumber: house.house_number,
      streetName: house.street?.name || 'Unknown Street',
      isCurrent,
      outstandingAmount: outstanding.amount,
      unpaidInvoiceCount: outstanding.count,
    });
  });

  // Sort: current properties first, then by outstanding amount descending
  properties.sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    return b.outstandingAmount - a.outstandingAmount;
  });

  // Check if there are previous properties with debts
  const hasPreviousPropertyDebts = properties.some(
    (p) => !p.isCurrent && p.outstandingAmount > 0
  );

  return { data: properties, error: null, hasPreviousPropertyDebts };
}
