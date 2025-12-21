'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { HouseWithResidents } from '@/types/database';

type GetHouseResponse = {
  data: HouseWithResidents | null;
  error: string | null;
}

export async function getHouse(id: string): Promise<GetHouseResponse> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('houses')
    .select(`
      *,
      street:streets(*),
      house_type:house_types(*),
      resident_houses(
        *,
        resident:residents!resident_id(*)
      )
    `)
    .eq('id', id)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as HouseWithResidents, error: null };
}
