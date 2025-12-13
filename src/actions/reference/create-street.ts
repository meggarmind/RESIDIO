'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { Street } from '@/types/database';
import type { StreetFormData } from '@/lib/validators/house';

export interface CreateStreetResponse {
  data: Street | null;
  error: string | null;
}

export async function createStreet(formData: StreetFormData): Promise<CreateStreetResponse> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, error: 'Unauthorized' };
  }

  const { data, error } = await supabase
    .from('streets')
    .insert({
      name: formData.name,
      short_name: formData.short_name || null,
      description: formData.description || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  revalidatePath('/houses');
  return { data, error: null };
}
