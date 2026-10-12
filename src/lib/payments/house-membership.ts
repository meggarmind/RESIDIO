import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * A payment's house must be one the resident is (or was) associated with.
 * Past houses are allowed: the payment form lets a resident settle debts on a
 * previous property (see getResidentPropertiesForPayment).
 *
 * Queries resident_houses directly (no embed), so there is no FK ambiguity.
 */
export async function residentHasHouse(
    supabase: SupabaseClient,
    residentId: string,
    houseId: string,
): Promise<{ ok: boolean; error?: string }> {
    const { data, error } = await supabase
        .from('resident_houses')
        .select('id')
        .eq('resident_id', residentId)
        .eq('house_id', houseId)
        .limit(1);

    if (error) {
        console.error('Payment house membership check failed:', error);
        return { ok: false, error: 'Could not verify that the house belongs to the resident' };
    }
    if (!data || data.length === 0) {
        return { ok: false, error: 'The selected house is not associated with this resident' };
    }
    return { ok: true };
}
