'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { UserRole } from '@/types/database';

export async function getServerSession() {
    const supabase = await createServerSupabaseClient();

    try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError || !user) {
            return { session: null, error: userError?.message || 'No session found' };
        }

        // Fetch profile data to help client-side hydration
        const { data: profile } = await supabase
            .from('profiles')
            .select('id, email, full_name, role, role_id, resident_id')
            .eq('id', user.id)
            .single();

        return {
            session: {
                user,
                profile: profile ? {
                    ...profile,
                    role: profile.role as UserRole
                } : null
            },
            error: null
        };
    } catch (err) {
        console.error('[getServerSession] Error:', err);
        return { session: null, error: 'Internal server error' };
    }
}
