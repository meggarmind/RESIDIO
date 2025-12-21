'use server';

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/logger';
import type { ResidentRole } from '@/types/database';

type BackfillResult = {
  success: boolean;
  error: string | null;
  summary: {
    housesProcessed: number;
    ownershipEndEventsCreated: number;
    moveOutEventsCreated: number;
    errors: string[];
  } | null;
}

/**
 * Backfill missing ownership history events.
 *
 * This action scans all houses and their resident_houses records to find
 * missing history events:
 *
 * 1. For inactive ownership records (non_resident_landlord, developer) without
 *    a corresponding ownership_end event, create the event.
 *
 * 2. For inactive tenant/secondary records without a move_out event, create it.
 *
 * Admin-only action.
 */
export async function backfillOwnershipHistory(): Promise<BackfillResult> {
  const supabase = await createServerSupabaseClient();
  const adminClient = createAdminClient();

  // Check authorization
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized', summary: null };
  }

  // Get user's role
  const { data: profile } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    return { success: false, error: 'Admin access required', summary: null };
  }

  const summary = {
    housesProcessed: 0,
    ownershipEndEventsCreated: 0,
    moveOutEventsCreated: 0,
    errors: [] as string[],
  };

  try {
    // Get all houses
    const { data: houses, error: housesError } = await adminClient
      .from('houses')
      .select('id, house_number');

    if (housesError) {
      return { success: false, error: `Failed to fetch houses: ${housesError.message}`, summary: null };
    }

    for (const house of houses || []) {
      summary.housesProcessed++;

      // Get all resident_houses records for this house (including inactive)
      const { data: residentHouses, error: rhError } = await adminClient
        .from('resident_houses')
        .select('id, resident_id, resident_role, is_active, move_in_date, move_out_date')
        .eq('house_id', house.id);

      if (rhError) {
        summary.errors.push(`House ${house.house_number}: Failed to fetch resident_houses - ${rhError.message}`);
        continue;
      }

      // Get all history events for this house
      const { data: historyEvents, error: historyError } = await adminClient
        .from('house_ownership_history')
        .select('id, resident_id, event_type, event_date')
        .eq('house_id', house.id);

      if (historyError) {
        summary.errors.push(`House ${house.house_number}: Failed to fetch history - ${historyError.message}`);
        continue;
      }

      // Create a set of existing history events for quick lookup
      // Key format: "{resident_id}:{event_type}"
      const existingEvents = new Set(
        (historyEvents || []).map(e => `${e.resident_id}:${e.event_type}`)
      );

      // Process each inactive resident_house record
      for (const rh of residentHouses || []) {
        if (rh.is_active) continue; // Skip active records
        if (!rh.move_out_date) continue; // Skip records without move_out_date

        const role = rh.resident_role as ResidentRole;
        const isOwnershipRole = role === 'non_resident_landlord' || role === 'developer' || role === 'resident_landlord';
        const eventType = isOwnershipRole ? 'ownership_end' : 'move_out';

        // Check if this event already exists
        const eventKey = `${rh.resident_id}:${eventType}`;
        if (existingEvents.has(eventKey)) {
          continue; // Event already exists
        }

        // Get resident name for notes
        const { data: resident } = await adminClient
          .from('residents')
          .select('first_name, last_name')
          .eq('id', rh.resident_id)
          .single();

        const residentName = resident
          ? `${resident.first_name} ${resident.last_name}`
          : 'Unknown Resident';

        // Create the missing history event
        const { error: insertError } = await adminClient
          .from('house_ownership_history')
          .insert({
            house_id: house.id,
            resident_id: rh.resident_id,
            resident_role: role,
            event_type: eventType,
            event_date: rh.move_out_date,
            notes: `${residentName} ${isOwnershipRole ? 'ownership ended' : 'moved out'} (backfilled)`,
            is_current: false,
            created_by: user.id,
          });

        if (insertError) {
          summary.errors.push(
            `House ${house.house_number}: Failed to create ${eventType} for ${residentName} - ${insertError.message}`
          );
        } else {
          if (isOwnershipRole) {
            summary.ownershipEndEventsCreated++;
          } else {
            summary.moveOutEventsCreated++;
          }

          // Log audit for each backfilled event
          await logAudit({
            action: 'GENERATE',
            entityType: 'houses',
            entityId: house.id,
            entityDisplay: house.house_number,
            description: `Backfilled ${eventType} event for ${residentName}`,
            newValues: {
              event_type: eventType,
              resident_name: residentName,
              event_date: rh.move_out_date,
            },
          });
        }

        // Also update is_current=false on any ownership_start events for this resident/house
        if (isOwnershipRole) {
          await adminClient
            .from('house_ownership_history')
            .update({ is_current: false })
            .eq('house_id', house.id)
            .eq('resident_id', rh.resident_id)
            .eq('is_current', true);
        }
      }
    }

    // Log summary audit if any events were created
    const totalCreated = summary.ownershipEndEventsCreated + summary.moveOutEventsCreated;
    if (totalCreated > 0) {
      await logAudit({
        action: 'GENERATE',
        entityType: 'houses',
        entityId: 'backfill-summary',
        entityDisplay: 'Ownership History Backfill',
        description: `Backfill completed: ${totalCreated} history event(s) created`,
        metadata: {
          houses_processed: summary.housesProcessed,
          ownership_end_events: summary.ownershipEndEventsCreated,
          move_out_events: summary.moveOutEventsCreated,
          errors_count: summary.errors.length,
        },
      });
    }

    return {
      success: true,
      error: null,
      summary,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      summary,
    };
  }
}
