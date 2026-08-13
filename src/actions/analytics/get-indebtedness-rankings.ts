'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';

export interface IndebtedResident {
  residentId: string;
  residentName: string;
  residentCode: string;
  houseNumber: string | null;
  streetName: string | null;
  outstanding: number;
}

export interface IndebtednessAnalytics {
  topIndebted: IndebtedResident[];
  topNonIndebted: IndebtedResident[];
  byStreet: Array<{ streetId: string; streetName: string; totalOutstanding: number }>;
  byHouseType: Array<{ houseTypeId: string; houseTypeName: string; totalOutstanding: number }>;
  lastUpdated: string;
}

interface InvoiceRow {
  resident_id: string;
  house_id: string;
  amount_due: number | null;
  amount_paid: number | null;
  resident: { id: string; first_name: string; last_name: string; resident_code: string } | null;
  house: {
    house_number: string;
    street_id: string | null;
    house_type_id: string | null;
    street: { name: string } | null;
  } | null;
}

export async function getIndebtednessAnalytics(): Promise<{ data: IndebtednessAnalytics | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  try {
    const { data: invoices, error } = await supabase
      .from('invoices')
      .select(`
        resident_id,
        house_id,
        amount_due,
        amount_paid,
        resident:residents(id, first_name, last_name, resident_code),
        house:houses(house_number, street_id, house_type_id, street:streets(name))
      `)
      .neq('status', 'void');

    if (error) return { data: null, error: error.message };

    const residentMap = new Map<string, IndebtedResident>();
    const streetOutstanding = new Map<string, { name: string; total: number }>();
    const houseTypeOutstanding = new Map<string, number>();

    (invoices as unknown as InvoiceRow[] | null)?.forEach((inv) => {
      const outstanding = (inv.amount_due || 0) - (inv.amount_paid || 0);
      if (!inv.resident_id || !inv.resident) return;

      const existing = residentMap.get(inv.resident_id);
      const houseNumber = inv.house?.house_number ?? null;
      const streetName = inv.house?.street?.name ?? null;
      if (existing) {
        existing.outstanding += outstanding;
      } else {
        residentMap.set(inv.resident_id, {
          residentId: inv.resident_id,
          residentName: `${inv.resident.first_name} ${inv.resident.last_name}`,
          residentCode: inv.resident.resident_code,
          houseNumber,
          streetName,
          outstanding,
        });
      }

      if (inv.house?.street_id && outstanding > 0) {
        const streetEntry = streetOutstanding.get(inv.house.street_id) ?? { name: streetName ?? 'Unknown', total: 0 };
        streetEntry.total += outstanding;
        streetOutstanding.set(inv.house.street_id, streetEntry);
      }
      if (inv.house?.house_type_id && outstanding > 0) {
        houseTypeOutstanding.set(inv.house.house_type_id, (houseTypeOutstanding.get(inv.house.house_type_id) ?? 0) + outstanding);
      }
    });

    const allResidents = Array.from(residentMap.values());
    const topIndebted = [...allResidents].sort((a, b) => b.outstanding - a.outstanding).slice(0, 10);
    const topNonIndebted = [...allResidents].sort((a, b) => a.outstanding - b.outstanding).slice(0, 10);

    // House type names need a lookup; fetch alongside since invoices don't join house_types directly
    const { data: houseTypes } = await supabase.from('house_types').select('id, name');
    const houseTypeNames = new Map((houseTypes ?? []).map((t) => [t.id, t.name]));

    const byStreet = Array.from(streetOutstanding.entries())
      .map(([streetId, { name, total }]) => ({ streetId, streetName: name, totalOutstanding: total }))
      .sort((a, b) => b.totalOutstanding - a.totalOutstanding);

    const byHouseType = Array.from(houseTypeOutstanding.entries())
      .map(([houseTypeId, total]) => ({ houseTypeId, houseTypeName: houseTypeNames.get(houseTypeId) ?? 'Unknown', totalOutstanding: total }))
      .sort((a, b) => b.totalOutstanding - a.totalOutstanding);

    const data: IndebtednessAnalytics = {
      topIndebted,
      topNonIndebted,
      byStreet,
      byHouseType,
      lastUpdated: new Date().toISOString(),
    };

    return { data, error: null };
  } catch (err) {
    console.error('[getIndebtednessAnalytics] error:', err);
    return { data: null, error: 'Failed to fetch indebtedness analytics' };
  }
}
