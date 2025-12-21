'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { HouseType } from '@/types/database';

type GetHouseTypesResponse = {
  data: (HouseType & { billing_profile: { name: string } | null })[];
  error: string | null;
}

export async function getHouseTypes(): Promise<GetHouseTypesResponse> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('house_types')
    .select(`
      *,
      billing_profile:billing_profiles(name)
    `)
    .eq('is_active', true)
    .order('name');

  return {
    data: data ?? [],
    error: error?.message ?? null,
  };
}
