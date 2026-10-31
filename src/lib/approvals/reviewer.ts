import { authorizePermission } from '@/lib/auth/authorize';
import { logAudit } from '@/lib/audit/logger';
import type { AuditEntry } from '@/lib/audit/recorder';

/** Who decides an approval request, and how their permissions are checked and their audit entries written (#1297). */
export interface ApprovalReviewer {
  authorize(permission: string): Promise<{ authorized: boolean; userId: string | null; error?: string | null }>;
  audit(entry: AuditEntry): Promise<void>;
}

/** The dashboard reviewer: the web session's user, as authorizePermission() and logAudit() see it. */
export const SESSION_REVIEWER: ApprovalReviewer = {
  authorize: (permission) => authorizePermission(permission as Parameters<typeof authorizePermission>[0]),
  audit: (entry) => logAudit(entry),
};
