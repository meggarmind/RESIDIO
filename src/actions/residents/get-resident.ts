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
      ),
      emergency_contact_resident:residents!emergency_contact_resident_id (
          first_name,
          last_name,
          phone_primary,
          resident_code
      )
    `)
    .eq('id', id)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as ResidentWithHouses, error: null };
}
