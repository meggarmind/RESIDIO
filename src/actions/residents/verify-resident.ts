'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function verifyResident(id: string) {
    const supabase = await createServerSupabaseClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { success: false, error: 'Unauthorized' };
    }

    // Check permissions (redundant with RLS policies but good for explicit feedback)
    const { data: roleData } = await supabase.rpc('get_my_role');
    const role = roleData as string;

    if (!['admin', 'chairman', 'financial_secretary'].includes(role)) {
        return { success: false, error: 'Insufficient permissions' };
    }

    const { error } = await supabase
        .from('residents')
        .update({
            verification_status: 'verified',
            updated_by: user.id
        })
        .eq('id', id);

    if (error) {
        return { success: false, error: error.message };
    }

    revalidatePath('/residents');
    revalidatePath(`/residents/${id}`);

    return { success: true, error: null };
}
