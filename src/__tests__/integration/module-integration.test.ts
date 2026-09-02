/**
 * Module Integration Compliance Tests
 *
 * These tests verify that all server actions that perform write operations
 * have proper permission checks and audit logging in place.
 *
 * Tests will FAIL if new write operations are added without proper integration.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

const ACTIONS_DIR = path.join(process.cwd(), 'src/actions');

// Files that are known exceptions (read-only, exports, type definitions, etc.)
const GENERAL_EXCEPTIONS = [
  'index.ts',
  'types.ts',
  'helpers.ts',
];

// Files that start with these prefixes are read-only
const READ_ONLY_PREFIXES = ['get-', 'check-', 'search-', 'list-', 'fetch-'];

// Files that don't need audit logging (read-only or export operations)
const AUDIT_ONLY_EXCEPTIONS = [...GENERAL_EXCEPTIONS, 'export.ts', 'export-'];

// Patterns that indicate a write operation
const WRITE_PATTERNS = [
  '.insert(',
  '.update(',
  '.delete(',
  '.upsert(',
];

// Known gaps that are still allowlisted.
//
// These lists are enforcement holes, not documentation: anything named here is
// exempt from the checks below. Keep them minimal and prune an entry as soon as
// the file complies, otherwise a later regression in that file goes unnoticed.
//
// Regenerate the true state rather than trusting the comments:
//   files with a write pattern but no permission check -> PERMISSION_ALLOWLIST
//   files with a write pattern but no logAudit call    -> AUDIT_ALLOWLIST
const PERMISSION_ALLOWLIST = [
  // ---- Admin-facing writes that authenticate (auth.getUser) but do not check
  // an RBAC role/permission. RLS on the underlying tables is currently the only
  // authorization boundary for these. Genuine gaps; close them per module.
  'approvals/developer-owner-approvals.ts',
  'billing/profiles.ts',
  'documents/categories.ts',
  'imports/bank-accounts.ts',
  'imports/create-import.ts',
  'imports/match-residents.ts',
  'imports/process-import.ts',
  'notifications/schedules.ts',
  'notifications/templates.ts',
  'reference/create-house-type.ts',
  'reference/create-street.ts',
  'reference/duplicate-street.ts',
  'reference/transaction-tags.ts',
  'reports/report-schedules.ts',
  'residents/aliases.ts',
  'residents/inherit-domestic-staff.ts',
  'residents/move-out-landlord.ts',
  'residents/remove-ownership.ts',
  'residents/sponsor-cascade.ts',
  'residents/swap-resident-roles.ts',
  'residents/update-resident-house.ts',
  'settings/backfill-ownership-history.ts',
  'settings/hierarchical-settings.ts',
  'settings/upload-estate-logo.ts',
  'verification/send-verification.ts',

  // ---- Not covered by admin RBAC by design (ownership / service / pre-auth).
  // Do NOT add authorizePermission to these.
  //
  // Business-rule authorization: validates the caller is the primary resident.
  'residents/add-household-member.ts',
  // Resident self-service: authorizes via auth.getUser() + resource ownership.
  'payments/verify-paystack-payment.ts',
  'payments/submit-payment-proof.ts',
  'billing/pay-invoice-with-wallet.ts',
  'billing/pay-multiple-invoices-with-wallet.ts',
  'paystack/initialize-payment.ts',
  'paystack/verify-payment.ts',
  // Unauthenticated Paystack webhook: auth is the webhook signature.
  'paystack/webhook-handler.ts',
  // Vercel cron (CRON_SECRET bearer auth, no user session) as well as manual
  // triggers; a hard permission check would break the automated path.
  'email-imports/reset-email-imports.ts',
  'email-imports/parse-email.ts',
  'email-imports/create-email-import.ts',
  'reports/process-schedules.ts',
  'analytics/refresh-payment-cadence-summary.ts',
  // Pre-auth: runs before the caller has a session.
  'auth/register-resident-portal.ts',
  'two-factor/verify.ts',
  // Read operations whose only write is their own access log / read receipt.
  'documents/download-document.ts',
  'announcements/read-receipts.ts',
];

const AUDIT_ALLOWLIST = [
  // logAudit() attributes an entry to the acting user from the session and
  // no-ops without one, so these flows cannot produce a meaningful entry here.
  //
  // Pre-auth: runs before the caller has a session.
  'auth/register-resident-portal.ts',
  // Pre-auth 2FA login flow: writes its own two_factor_audit_log instead.
  'two-factor/verify.ts',
  // Vercel cron (CRON_SECRET bearer auth, no user session): recomputes an
  // analytics cache table with no admin-attributable actor.
  'analytics/refresh-payment-cadence-summary.ts',

  // ---- Reads that the write-pattern scan sees as writes.
  //
  // Issues signed storage URLs; its only write is its own document_access_logs
  // entry, which is that module's access trail.
  'documents/download-document.ts',
  // Per-resident read tracking. Auditing every announcement view would flood
  // the audit log without recording an administrative decision.
  'announcements/read-receipts.ts',
];

function isReadOnlyFile(filename: string): boolean {
  const basename = path.basename(filename);
  return (
    GENERAL_EXCEPTIONS.includes(basename) ||
    READ_ONLY_PREFIXES.some((prefix) => basename.startsWith(prefix))
  );
}

function isAuditException(filename: string): boolean {
  const basename = path.basename(filename);
  return (
    AUDIT_ONLY_EXCEPTIONS.some((ex) => basename.includes(ex)) ||
    READ_ONLY_PREFIXES.some((prefix) => basename.startsWith(prefix))
  );
}

function isWriteOperation(content: string): boolean {
  return WRITE_PATTERNS.some((pattern) => content.includes(pattern));
}

function hasPermissionCheck(content: string): boolean {
  return (
    content.includes('authorizePermission') ||
    content.includes('authorizeAction') ||
    content.includes('authorizeAnyPermission')
  );
}

function hasAuditLog(content: string): boolean {
  return content.includes('logAudit');
}

function isAllowlisted(file: string, allowlist: string[]): boolean {
  // Normalize path separators
  const normalizedFile = file.replace(/\\/g, '/');
  return allowlist.some((allowed) => normalizedFile.includes(allowed));
}

describe('Module Integration Compliance', () => {
  describe('Permission Checks', () => {
    it('all write actions should use authorizePermission', async () => {
      const actionFiles = await glob('**/*.ts', { cwd: ACTIONS_DIR });
      const violations: string[] = [];

      for (const file of actionFiles) {
        // Skip read-only and exception files
        if (isReadOnlyFile(file)) continue;

        // Skip allowlisted files (known gaps)
        if (isAllowlisted(file, PERMISSION_ALLOWLIST)) continue;

        const fullPath = path.join(ACTIONS_DIR, file);
        const content = fs.readFileSync(fullPath, 'utf-8');

        // Check if it's a write operation
        if (!isWriteOperation(content)) continue;

        // Check for permission check
        if (!hasPermissionCheck(content)) {
          violations.push(`src/actions/${file}`);
        }
      }

      expect(
        violations,
        `Files missing permission checks:\n${violations.join('\n')}\n\nAdd permission checks or update PERMISSION_ALLOWLIST in test file.`
      ).toHaveLength(0);
    });
  });

  describe('Audit Logging', () => {
    it('all write actions should use logAudit', async () => {
      const actionFiles = await glob('**/*.ts', { cwd: ACTIONS_DIR });
      const violations: string[] = [];

      for (const file of actionFiles) {
        // Skip read-only and exception files
        if (isAuditException(file)) continue;

        // Skip allowlisted files (known gaps)
        if (isAllowlisted(file, AUDIT_ALLOWLIST)) continue;

        const fullPath = path.join(ACTIONS_DIR, file);
        const content = fs.readFileSync(fullPath, 'utf-8');

        // Check if it's a write operation
        if (!isWriteOperation(content)) continue;

        // Check for audit logging
        if (!hasAuditLog(content)) {
          violations.push(`src/actions/${file}`);
        }
      }

      expect(
        violations,
        `Files missing audit logging:\n${violations.join('\n')}\n\nAdd logAudit calls or update AUDIT_ALLOWLIST in test file.`
      ).toHaveLength(0);
    });
  });

  describe('Allowlist Tracking', () => {
    it('should report current gap counts for visibility', () => {
      // This test always passes but logs the current state
      console.log('\n📊 Integration Gap Summary:');
      console.log(`   Permission gaps: ${PERMISSION_ALLOWLIST.length} files`);
      console.log(`   Audit gaps: ${AUDIT_ALLOWLIST.length} files`);
      console.log('\n   Remove items from allowlists as they are fixed.\n');

      // Track progress over time - these should decrease
      expect(PERMISSION_ALLOWLIST.length).toBeGreaterThanOrEqual(0);
      expect(AUDIT_ALLOWLIST.length).toBeGreaterThanOrEqual(0);
    });
  });
});
