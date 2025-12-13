'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { House } from '@/types/database';
import type { HouseFormData } from '@/lib/validators/house';
import { createApprovalRequest, canAutoApprove } from '@/actions/approvals';

export interface UpdateHouseResponse {
  data: House | null;
  error: string | null;
  approval_required?: boolean;
  request_id?: string;
}

// Check if house has existing Development Levy
async function hasExistingDevelopmentLevy(houseId: string): Promise<boolean> {
  const supabase = await createServerSupabaseClient();

  // Check house_levy_history for Development Levy
  const { data } = await supabase
    .from('house_levy_history')
    .select(`
      id,
      billing_profile:billing_profiles(name)
    `)
    .eq('house_id', houseId);

  if (!data || data.length === 0) return false;

  // Check if any of the levies is a Development Levy
  return data.some((levy) => {
    const profile = levy.billing_profile as unknown as { name: string } | null;
    return profile?.name?.toLowerCase().includes('development');
  });
}

export async function updateHouse(id: string, formData: HouseFormData): Promise<UpdateHouseResponse> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, error: 'Unauthorized' };
  }

  // Get current house data to check for plots change
  const { data: currentHouse, error: fetchError } = await supabase
    .from('houses')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !currentHouse) {
    return { data: null, error: 'House not found' };
  }

  // Check if number_of_plots is being changed
  const newPlots = formData.number_of_plots ?? 1;
  const currentPlots = currentHouse.number_of_plots ?? 1;
  const isPlotsChange = newPlots !== currentPlots;

  // If plots are changing and house has existing Development Levy, check maker-checker
  if (isPlotsChange && await hasExistingDevelopmentLevy(id)) {
    const autoApprove = await canAutoApprove();

    if (!autoApprove) {
      // Create approval request
      const result = await createApprovalRequest({
        request_type: 'house_plots_change',
        entity_type: 'house',
        entity_id: id,
        requested_changes: { number_of_plots: newPlots },
        current_values: { number_of_plots: currentPlots },
        reason: `Changing plots from ${currentPlots} to ${newPlots} affects existing Development Levy calculation`,
      });

      if (!result.success) {
        return { data: null, error: result.error || 'Failed to create approval request' };
      }

      // Update other fields except number_of_plots
      const { data, error } = await supabase
        .from('houses')
        .update({
          house_number: formData.house_number,
          street_id: formData.street_id,
          house_type_id: formData.house_type_id || null,
          address_line_2: formData.address_line_2 || null,
          notes: formData.notes || null,
          billing_profile_id: formData.billing_profile_id || null,
          // Don't update number_of_plots - pending approval
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return { data: null, error: error.message };
      }

      revalidatePath('/houses');
      revalidatePath(`/houses/${id}`);

      return {
        data,
        error: null,
        approval_required: true,
        request_id: result.request_id,
      };
    }
  }

  // Apply all changes directly (either no plots change, no existing levy, or user can auto-approve)
  const { data, error } = await supabase
    .from('houses')
    .update({
      house_number: formData.house_number,
      street_id: formData.street_id,
      house_type_id: formData.house_type_id || null,
      address_line_2: formData.address_line_2 || null,
      notes: formData.notes || null,
      billing_profile_id: formData.billing_profile_id || null,
      number_of_plots: newPlots,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return { data: null, error: 'A house with this number already exists on this street' };
    }
    return { data: null, error: error.message };
  }

  revalidatePath('/houses');
  revalidatePath(`/houses/${id}`);
  return { data, error: null };
}
