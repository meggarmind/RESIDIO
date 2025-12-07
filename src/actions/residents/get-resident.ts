'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ResidentWithHouses } from '@/types/database';

export interface GetResidentResponse {
  data: ResidentWithHouses | null;
  error: string | null;
}

export async function getResident(id: string): Promise<GetResidentResponse> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('residents')
    .select(`
      *,
      resident_houses(
        *,
        house:houses(
          *,
          street:streets(*),
          house_type:house_types(*)
        )
      )
    `)
    .eq('id', id)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as ResidentWithHouses, error: null };
}
