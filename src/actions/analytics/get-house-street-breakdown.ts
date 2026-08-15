'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { OccupancyData } from '@/types/analytics';

export interface StreetAggregate {
  streetId: string;
  streetName: string;
  totalHouses: number;
  occupiedHouses: number;
  vacantHouses: number;
  occupancyRate: number;
  totalOutstanding: number;
}

export interface HouseTypeAggregate {
  houseTypeId: string;
  houseTypeName: string;
  totalHouses: number;
  occupiedHouses: number;
  occupancyRate: number;
}

export interface HouseStreetAnalytics {
  byStreet: StreetAggregate[];
  byHouseType: HouseTypeAggregate[];
  overallOccupancy: OccupancyData;
  lastUpdated: string;
}

export async function getHouseStreetAnalytics(): Promise<{ data: HouseStreetAnalytics | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  try {
    const [housesResult, streetsResult, houseTypesResult, invoicesResult] = await Promise.all([
      supabase.from('houses').select('id, street_id, house_type_id, is_occupied').eq('is_active', true),
      supabase.from('streets').select('id, name').eq('is_active', true),
      supabase.from('house_types').select('id, name').eq('is_active', true),
      supabase.from('invoices').select('house_id, amount_due, amount_paid').neq('status', 'void'),
    ]);

    if (housesResult.error) return { data: null, error: housesResult.error.message };
    if (streetsResult.error) return { data: null, error: streetsResult.error.message };
    if (houseTypesResult.error) return { data: null, error: houseTypesResult.error.message };
    if (invoicesResult.error) return { data: null, error: invoicesResult.error.message };

    const houses = housesResult.data ?? [];
    const streetNames = new Map((streetsResult.data ?? []).map((s) => [s.id, s.name]));
    const houseTypeNames = new Map((houseTypesResult.data ?? []).map((t) => [t.id, t.name]));

    // House -> street_id map, for joining invoice outstanding to streets
    const houseStreetMap = new Map(houses.map((h) => [h.id, h.street_id]));
    const outstandingByStreet = new Map<string, number>();
    (invoicesResult.data ?? []).forEach((inv) => {
      const outstanding = (inv.amount_due || 0) - (inv.amount_paid || 0);
      if (outstanding <= 0) return;
      const streetId = houseStreetMap.get(inv.house_id);
      if (!streetId) return;
      outstandingByStreet.set(streetId, (outstandingByStreet.get(streetId) ?? 0) + outstanding);
    });

    // Aggregate houses by street
    const streetAgg = new Map<string, { total: number; occupied: number }>();
    const houseTypeAgg = new Map<string, { total: number; occupied: number }>();
    let totalOccupied = 0;

    houses.forEach((h) => {
      if (h.is_occupied) totalOccupied++;

      if (h.street_id) {
        const existing = streetAgg.get(h.street_id) ?? { total: 0, occupied: 0 };
        existing.total++;
        if (h.is_occupied) existing.occupied++;
        streetAgg.set(h.street_id, existing);
      }

      if (h.house_type_id) {
        const existing = houseTypeAgg.get(h.house_type_id) ?? { total: 0, occupied: 0 };
        existing.total++;
        if (h.is_occupied) existing.occupied++;
        houseTypeAgg.set(h.house_type_id, existing);
      }
    });

    const byStreet: StreetAggregate[] = Array.from(streetAgg.entries()).map(([streetId, agg]) => ({
      streetId,
      streetName: streetNames.get(streetId) ?? 'Unknown',
      totalHouses: agg.total,
      occupiedHouses: agg.occupied,
      vacantHouses: agg.total - agg.occupied,
      occupancyRate: agg.total > 0 ? Math.round((agg.occupied / agg.total) * 100) : 0,
      totalOutstanding: outstandingByStreet.get(streetId) ?? 0,
    })).sort((a, b) => b.totalOutstanding - a.totalOutstanding);

    const byHouseType: HouseTypeAggregate[] = Array.from(houseTypeAgg.entries()).map(([houseTypeId, agg]) => ({
      houseTypeId,
      houseTypeName: houseTypeNames.get(houseTypeId) ?? 'Unknown',
      totalHouses: agg.total,
      occupiedHouses: agg.occupied,
      occupancyRate: agg.total > 0 ? Math.round((agg.occupied / agg.total) * 100) : 0,
    })).sort((a, b) => b.totalHouses - a.totalHouses);

    const overallOccupancy: OccupancyData = {
      occupied: totalOccupied,
      vacant: houses.length - totalOccupied,
      total: houses.length,
      percentage: houses.length > 0 ? Math.round((totalOccupied / houses.length) * 100) : 0,
    };

    const data: HouseStreetAnalytics = {
      byStreet,
      byHouseType,
      overallOccupancy,
      lastUpdated: new Date().toISOString(),
    };

    return { data, error: null };
  } catch (err) {
    console.error('[getHouseStreetAnalytics] error:', err);
    return { data: null, error: 'Failed to fetch house/street analytics' };
  }
}
