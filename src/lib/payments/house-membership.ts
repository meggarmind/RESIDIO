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

/**
 * The house to record a payment against when the caller gave none (#1363): the resident's
 * only active house. Zero or several active houses, or a failed lookup, give null; we never guess.
 */
export async function soleActiveHouseId(
    supabase: SupabaseClient,
    residentId: string,
): Promise<string | null> {
    const { data, error } = await supabase
        .from('resident_houses')
        .select('house_id')
        .eq('resident_id', residentId)
        .eq('is_active', true)
        .limit(2);

    if (error) {
        console.error('Payment sole active house lookup failed:', error);
        return null;
    }
    return data?.length === 1 ? data[0].house_id : null;
}
