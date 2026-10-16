import { notifyUser } from '@/lib/notifications/user-notifier';
import { APPROVAL_REQUEST_TYPE_LABELS } from '@/types/database';
import type { ApprovalRequest, ApprovalRequestType } from '@/types/database';

/** Outcomes the requester can be told about. 'expired' is the 72-hour auto-reject (#558). */
export type ApprovalOutcome = 'approved' | 'rejected' | 'expired';

function requestLabel(requestType: string): string {
    return APPROVAL_REQUEST_TYPE_LABELS[requestType as ApprovalRequestType] ?? requestType;
}

/**
 * Tells the requester of an approval request how it ended, in-app only. Never throws and never
 * notifies when the requester is the one who made the decision. Does not include requested_changes.
 */
export async function notifyRequesterOfOutcome(params: {
    request: Pick<ApprovalRequest, 'id' | 'requested_by'> & { request_type: string };
    outcome: ApprovalOutcome;
    reviewerId?: string | null;
    reviewNotes?: string | null;
}): Promise<void> {
    const { request, outcome, reviewerId, reviewNotes } = params;
    try {
        if (!request.requested_by) return;
        if (reviewerId && reviewerId === request.requested_by) return;

        const label = requestLabel(request.request_type);
        const notes = reviewNotes?.trim();
        const body =
            outcome === 'expired'
                ? `Your request "${label}" expired after 72 hours without a response.`
                : `Your request "${label}" was ${outcome}.` +
                  (outcome === 'rejected' && notes ? ` Reason: ${notes}` : '');

        await notifyUser({
            recipientId: request.requested_by,
            title: `Request ${outcome}`,
            body,
            category: 'info',
            actionUrl: '/approvals',
            priority: outcome === 'approved' ? 'normal' : 'high',
            metadata: { approval_request_id: request.id, request_type: request.request_type, outcome },
        });
    } catch (error) {
        console.error(`[notifyRequesterOfOutcome] Failed for approval request ${request.id}:`, error);
    }
}
