'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';

export interface HouseStats {
  total: number;
  occupied: number;
  vacant: number;
  inactive: number;
}

/**
 * Get house statistics for the stats cards.
 * Uses COUNT queries for optimal performance.
 */
export async function getHouseStats(): Promise<{
  data: HouseStats | null;
  error: string | null;
}> {
  const supabase = await createServerSupabaseClient();

  try {
    // Run all count queries in parallel
    const [totalResult, occupiedResult, vacantResult, inactiveResult] = await Promise.all([
      // Total active houses
      supabase
        .from('houses')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true),

      // Occupied houses
      supabase
        .from('houses')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true)
        .eq('is_occupied', true),

      // Vacant houses (active but not occupied)
      supabase
        .from('houses')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true)
        .eq('is_occupied', false),

      // Inactive houses
      supabase
        .from('houses')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', false),
    ]);

    // Check for errors
    if (totalResult.error) throw totalResult.error;
    if (occupiedResult.error) throw occupiedResult.error;
    if (vacantResult.error) throw vacantResult.error;
    if (inactiveResult.error) throw inactiveResult.error;

    return {
      data: {
        total: totalResult.count ?? 0,
        occupied: occupiedResult.count ?? 0,
        vacant: vacantResult.count ?? 0,
        inactive: inactiveResult.count ?? 0,
      },
      error: null,
    };
  } catch (error) {
    console.error('Error fetching house stats:', error);
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Failed to fetch house stats',
    };
  }
}
