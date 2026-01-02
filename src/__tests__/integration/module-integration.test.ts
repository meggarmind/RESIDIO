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

// Known gaps that are temporarily allowlisted
// These should be removed as each module is fixed
const PERMISSION_ALLOWLIST = [
  // CRITICAL Priority - Residents
  'residents/create-resident.ts',
  'residents/delete-resident.ts',
  'residents/add-household-member.ts',
  'residents/assign-house.ts',
  'residents/unassign-house.ts',
  'residents/transfer-ownership.ts',
  'residents/remove-ownership.ts',
  'residents/swap-resident-roles.ts',
  'residents/move-out-landlord.ts',
  'residents/inherit-domestic-staff.ts',
  'residents/update-resident-house.ts',
  'residents/sponsor-cascade.ts',
  'residents/aliases.ts',
  // CRITICAL Priority - Billing
  'billing/generate-invoices.ts',
  'billing/generate-levies.ts',
  'billing/wallet.ts',
  'billing/profiles.ts',
  'billing/apply-late-fees.ts',
  // CRITICAL Priority - Payments
  'payments/create-payment.ts',
  'payments/create-split-payment.ts',
  'payments/bulk-update-payments.ts',
  // HIGH Priority - Houses
  'houses/create-house.ts',
  'houses/property-transition.ts',
  // HIGH Priority - Documents
  'documents/upload-document.ts',
  'documents/update-document.ts',
  'documents/delete-document.ts',
  'documents/categories.ts',
  // HIGH Priority - Security
  'security/categories.ts',
  'security/settings.ts',
  // HIGH Priority - Settings
  'settings/update-setting.ts',
  'settings/upload-estate-logo.ts',
  'settings/backfill-ownership-history.ts',
  'settings/hierarchical-settings.ts',
  // HIGH Priority - Auth
  'auth/register-resident-portal.ts',
  // MEDIUM Priority - References
  'reference/create-street.ts',
  'reference/create-house-type.ts',
  'reference/update-house-type.ts',
  'reference/delete-house-type.ts',
  'reference/duplicate-street.ts',
  'reference/transaction-tags.ts',
  // MEDIUM Priority - Imports
  'imports/create-import.ts',
  'imports/process-import.ts',
  'imports/bank-accounts.ts',
  'imports/match-residents.ts',
  // MEDIUM Priority - Notifications
  'notifications/send.ts',
  'notifications/preferences.ts',
  'notifications/queue.ts',
  'notifications/schedules.ts',
  'notifications/templates.ts',
  // MEDIUM Priority - Email
  'email/send-payment-reminders.ts',
  'email/send-invoice-email.ts',
  'email/send-payment-receipt-email.ts',
  'email/send-welcome-email.ts',
  'email/test-email.ts',
  // MEDIUM Priority - Reports
  'reports/report-schedules.ts',
  // MEDIUM Priority - Approvals
  'approvals/developer-owner-approvals.ts',
  // Verification
  'verification/send-verification.ts',
  // Read-related files that have write patterns but are read operations
  'documents/download-document.ts',
  'announcements/read-receipts.ts',
];

const AUDIT_ALLOWLIST = [
  // CRITICAL Priority - Residents (same as permission, most are missing both)
  'residents/create-resident.ts',
  'residents/delete-resident.ts',
  'residents/add-household-member.ts',
  'residents/assign-house.ts',
  'residents/unassign-house.ts',
  'residents/transfer-ownership.ts',
  'residents/remove-ownership.ts',
  'residents/swap-resident-roles.ts',
  'residents/move-out-landlord.ts',
  'residents/inherit-domestic-staff.ts',
  'residents/update-resident-house.ts',
  'residents/sponsor-cascade.ts',
  // CRITICAL Priority - Billing
  'billing/generate-levies.ts',
  'billing/wallet.ts',
  'billing/profiles.ts',
  // CRITICAL Priority - Payments
  'payments/create-split-payment.ts',
  'payments/bulk-update-payments.ts',
  // HIGH Priority - Houses
  'houses/create-house.ts',
  'houses/property-transition.ts',
  // HIGH Priority - Documents
  'documents/upload-document.ts',
  'documents/update-document.ts',
  'documents/delete-document.ts',
  'documents/categories.ts',
  // HIGH Priority - Security
  'security/categories.ts',
  'security/settings.ts',
  // HIGH Priority - Settings
  'settings/update-setting.ts',
  'settings/upload-estate-logo.ts',
  'settings/hierarchical-settings.ts',
  // HIGH Priority - Auth
  'auth/register-resident-portal.ts',
  // MEDIUM Priority - References
  'reference/create-street.ts',
  'reference/create-house-type.ts',
  'reference/update-house-type.ts',
  'reference/delete-house-type.ts',
  'reference/duplicate-street.ts',
  // MEDIUM Priority - Email
  'email/send-invoice-email.ts',
  'email/send-payment-receipt-email.ts',
  'email/send-welcome-email.ts',
  'email/test-email.ts',
  // MEDIUM Priority - Approvals
  'approvals/developer-owner-approvals.ts',
  // Verification
  'verification/send-verification.ts',
  // Read-related files that have write patterns but are read operations
  'documents/download-document.ts',
  'announcements/read-receipts.ts',
  // MEDIUM Priority - Imports
  'imports/match-residents.ts',
  // Missing audit on modules that have permission checks
  'report-subscriptions/update-subscription.ts',
  'payments/update-payment.ts',
  'payments/delete-payment.ts',
  'in-app-notifications/update-notification.ts',
  'in-app-notifications/create-notification.ts',
  'houses/update-house.ts',
  'houses/delete-house.ts',
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
    content.includes('authorizeAnyPermission') ||
    content.includes('hasSecurityPermission')
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
