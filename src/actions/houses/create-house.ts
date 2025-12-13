'use server';

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { House } from '@/types/database';
import type { HouseFormData } from '@/lib/validators/house';
import { generateLeviesForHouse } from '@/actions/billing/generate-levies';

export interface CreateHouseResponse {
  data: House | null;
  error: string | null;
}

export async function createHouse(formData: HouseFormData): Promise<CreateHouseResponse> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, error: 'Unauthorized' };
  }

  const { data, error } = await supabase
    .from('houses')
    .insert({
      house_number: formData.house_number,
      street_id: formData.street_id,
      house_type_id: formData.house_type_id || null,
      address_line_2: formData.address_line_2 || null,
      notes: formData.notes || null,
      billing_profile_id: formData.billing_profile_id || null,
      number_of_plots: formData.number_of_plots ?? 1,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return { data: null, error: 'A house with this number already exists on this street' };
    }
    return { data: null, error: error.message };
  }

  // Record house_added history event
  try {
    const adminClient = createAdminClient();
    const eventDate = formData.date_added_to_portal || new Date().toISOString().split('T')[0];

    await adminClient
      .from('house_ownership_history')
      .insert({
        house_id: data.id,
        event_type: 'house_added',
        event_date: eventDate,
        notes: 'House added to Residio portal',
        is_current: false,
        created_by: user.id,
      });
  } catch (historyError) {
    console.error('[createHouse] Error recording house_added history:', historyError);
    // Don't fail the house creation for history errors
  }

  // Generate one-time levies for the house (if auto_generate_levies is enabled)
  // Note: This will only generate levies if there's a primary resident assigned
  try {
    const levyResult = await generateLeviesForHouse(data.id);
    if (levyResult.generated > 0) {
      console.log(`[createHouse] Generated ${levyResult.generated} levies for house ${data.house_number}`);
    }
  } catch (levyError) {
    console.error('[createHouse] Error generating levies:', levyError);
    // Don't fail the house creation for levy errors
  }

  revalidatePath('/houses');
  return { data, error: null };
}
