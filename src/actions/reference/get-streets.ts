'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { Street } from '@/types/database';

type GetStreetsResponse = {
  data: Street[];
  error: string | null;
}

export async function getStreets(): Promise<GetStreetsResponse> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('streets')
    .select('*')
    .eq('is_active', true)
    .order('name');

  return {
    data: data ?? [],
    error: error?.message ?? null,
  };
}
