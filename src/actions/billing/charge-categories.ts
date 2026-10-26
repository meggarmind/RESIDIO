'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ChargeCategory } from '@/lib/billing/charge-categories';

/** Active charge categories in display order (#1189). */
export async function getChargeCategories(): Promise<{ data: ChargeCategory[]; error: string | null }> {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
        .from('charge_categories')
        .select('code, name, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

    return { data: data || [], error: error?.message || null };
}
