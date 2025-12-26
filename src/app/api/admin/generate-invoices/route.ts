import { NextRequest, NextResponse } from 'next/server';
import { generateMonthlyInvoices } from '@/actions/billing/generate-invoices';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// Configure for potentially long-running task
export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Admin endpoint for manual invoice generation
 * Requires authenticated admin user
 */
export async function POST(request: NextRequest) {
    try {
        // Verify user is authenticated admin
        const supabase = await createServerSupabaseClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }

        // Check if user has admin role
        const { data: profile } = await supabase
            .from('profiles')
            .select('role_id, app_roles(name)')
            .eq('id', user.id)
            .single();

        const roleName = (profile?.app_roles as any)?.name;
        if (!['super_admin', 'chairman', 'financial_officer'].includes(roleName)) {
            return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        }

        console.log('[Admin] Starting manual invoice generation by', user.email);

        const result = await generateMonthlyInvoices(new Date(), 'manual');

        console.log('[Admin] Invoice generation completed:', {
            generated: result.generated,
            skipped: result.skipped,
            errors: result.errors.length,
        });

        return NextResponse.json({
            success: result.success,
            generated: result.generated,
            skipped: result.skipped,
            skipReasons: result.skipReasons,
            errorCount: result.errors.length,
            errors: result.errors.slice(0, 20),
            logId: result.logId,
            durationMs: result.durationMs,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('[Admin] Invoice generation error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
