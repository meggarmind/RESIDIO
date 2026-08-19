'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getPersonnel } from '@/actions/personnel/actions';

export interface SmartSuggestion {
    id: string;
    title: string;
    description: string;
    actionLabel: string;
    actionUrl: string;
    priority: 'high' | 'medium' | 'low';
    type: 'finance' | 'occupancy' | 'security' | 'maintenance';
}

// Thresholds are developer-defined for this rule-based first pass (see issue #93) -
// not user-configurable yet.
const SEVERELY_OVERDUE_DAYS = 30;
const SEVERELY_OVERDUE_COUNT_THRESHOLD = 10;
const STALE_APPROVAL_DAYS = 5;

/**
 * Evaluates a small set of rule-based checks against existing aggregate data
 * and returns the suggestions whose threshold is currently met.
 */
export async function getSmartSuggestions(): Promise<{ data: SmartSuggestion[]; error: string | null }> {
    const supabase = await createServerSupabaseClient();
    const suggestions: SmartSuggestion[] = [];

    const now = new Date();
    const todayIso = now.toISOString().split('T')[0];
    const severelyOverdueCutoff = new Date(now.getTime() - SEVERELY_OVERDUE_DAYS * 24 * 60 * 60 * 1000);
    const staleApprovalCutoffIso = new Date(now.getTime() - STALE_APPROVAL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const [overdueResult, approvalsResult, personnelResult] = await Promise.all([
        supabase
            .from('invoices')
            .select('due_date')
            .in('status', ['unpaid', 'partially_paid'])
            .lt('due_date', todayIso),
        supabase
            .from('approval_requests')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending')
            .lt('created_at', staleApprovalCutoffIso),
        getPersonnel({ accountability: 'unassigned', activeOnly: true }),
    ]);

    // Rule: a meaningful number of invoices are severely overdue (30+ days)
    if (!overdueResult.error && overdueResult.data) {
        const severelyOverdueCount = overdueResult.data.filter(
            (invoice) => new Date(invoice.due_date) < severelyOverdueCutoff
        ).length;

        if (severelyOverdueCount >= SEVERELY_OVERDUE_COUNT_THRESHOLD) {
            suggestions.push({
                id: 'suggestion-severely-overdue-invoices',
                title: 'Invoices severely overdue',
                description: `${severelyOverdueCount} invoices are ${SEVERELY_OVERDUE_DAYS}+ days overdue. Send reminders?`,
                actionLabel: 'View overdue invoices',
                actionUrl: '/billing?filter=overdue',
                priority: 'high',
                type: 'finance',
            });
        }
    }

    // Rule: pending approvals have been waiting for a while
    if (!approvalsResult.error) {
        const staleApprovalCount = approvalsResult.count ?? 0;
        if (staleApprovalCount > 0) {
            suggestions.push({
                id: 'suggestion-stale-approvals',
                title: 'Pending approvals need attention',
                description: `${staleApprovalCount} approval${staleApprovalCount === 1 ? '' : 's'} ${staleApprovalCount === 1 ? 'has' : 'have'} been waiting for more than ${STALE_APPROVAL_DAYS} days.`,
                actionLabel: 'Review approvals',
                actionUrl: '/approvals',
                priority: 'high',
                type: 'occupancy',
            });
        }
    }

    // Rule: personnel with no active engagement (accountability gap)
    if (!personnelResult.error && personnelResult.data) {
        const unassignedCount = personnelResult.data.length;
        if (unassignedCount > 0) {
            suggestions.push({
                id: 'suggestion-unassigned-personnel',
                title: 'Personnel need accountability assigned',
                description: `${unassignedCount} personnel record${unassignedCount === 1 ? '' : 's'} ${unassignedCount === 1 ? 'has' : 'have'} no active engagement. Assign accountability?`,
                actionLabel: 'Review personnel',
                actionUrl: '/personnel',
                priority: 'medium',
                type: 'maintenance',
            });
        }
    }

    return { data: suggestions, error: null };
}
