'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { HouseType } from '@/types/database';

export interface GetHouseTypesResponse {
  data: HouseType[];
  error: string | null;
}

export async function getHouseTypes(): Promise<GetHouseTypesResponse> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('house_types')
    .select('*')
    .eq('is_active', true)
    .order('name');

  return {
    data: data ?? [],
    error: error?.message ?? null,
  };
}
