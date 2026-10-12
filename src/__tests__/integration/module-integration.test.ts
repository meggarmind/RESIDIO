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
  // ---- The 24 "genuine gap" entries that used to sit here were closed by #108.
  // 66 write actions across 23 files now call authorizePermission() before any
  // database operation, verified by placement and not merely by presence. Do not
  // re-add an entry here to make this suite pass: that reopens the gap silently,
  // which is the whole failure mode the allowlist exists to make visible.
  //
  // reports/report-schedules.ts is fully guarded (#388). saveGeneratedReport now
  // calls authorizePermission(REPORTS_VIEW_FINANCIAL), deliberately matching the
  // live RLS INSERT policy on generated_reports, and uses the session client
  // only. The service-role cron writes (getDueSchedules, markScheduleExecuted,
  // saveScheduledReport) moved to src/lib/reports/scheduled-report-store.ts: a
  // plain server lib, not a use-server module, imported only by the
  // CRON_SECRET-authenticated /api/cron/generate-reports route. It sits outside
  // this src/actions/** scan by design, so it is not, and must not become, an
  // allowlist entry.

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

const SRC_DIR = path.join(process.cwd(), 'src');

// Files OUTSIDE src/actions/** that may carry a top-level 'use server'
// directive. Such a directive makes every export a callable server-action RPC
// endpoint, but the permission/audit scans above only look at src/actions/**,
// so a stray directive elsewhere is an unguarded endpoint nobody checks (#409).
// Exact paths, relative to the repo root. Keep this list minimal.
const USE_SERVER_OUTSIDE_ACTIONS_ALLOWLIST = [
  // Exposes only the caller's own permission state (getCurrentUserPermissions,
  // authorizePermission, authorizeAnyPermission). Out of scope for #409.
  'src/lib/auth/authorize.ts',
];

/**
 * True when the file's leading directive is 'use server' / "use server".
 * Skips a BOM, whitespace and leading comments; a later mention of the string
 * (in a comment, a string literal, or a function-level directive) does not count.
 */
function hasTopLevelUseServer(content: string): boolean {
  let rest = content.replace(/^﻿/, '');
  for (;;) {
    const trimmed = rest.replace(/^\s+/, '');
    if (trimmed.startsWith('//')) {
      const eol = trimmed.indexOf('\n');
      rest = eol === -1 ? '' : trimmed.slice(eol + 1);
    } else if (trimmed.startsWith('/*')) {
      const end = trimmed.indexOf('*/');
      rest = end === -1 ? '' : trimmed.slice(end + 2);
    } else {
      rest = trimmed;
      break;
    }
  }
  return /^(['"])use server\1(?:\s*;|\s*$|\s*\n|\s*\/\/|\s*\/\*)/.test(rest);
}

/**
 * True when any line is a bare 'use server' / "use server" string statement
 * (optional `;`, optional trailing `//` or block comment). Inside a function
 * body this makes that one function a callable server-action endpoint (#460);
 * at the top of a file it is the module directive. Mentions of the words in
 * other code, longer string literals, or comments do not match.
 */
function hasUseServerDirectiveLine(content: string): boolean {
  return content
    .split(/\r?\n/)
    .some((line) => /^\s*(['"])use server\1\s*;?\s*(?:\/\/.*|\/\*.*)?$/.test(line));
}

function isAllowlisted(file: string, allowlist: string[]): boolean {
  // Normalize path separators
  const normalizedFile = file.replace(/\\/g, '/');
  return allowlist.some((allowed) => normalizedFile.includes(allowed));
}

/**
 * These two tests walk every file under `src/actions/**` and read each one.
 * On an idle machine that takes ~3.8s and ~1.1s against vitest's 5s default,
 * so under any real CPU contention (a parallel suite, a concurrent worktree,
 * CI running other jobs) they time out and report as failures of the code
 * under test rather than of the clock. Give the scan explicit room; it is a
 * filesystem walk, not a behavioural assertion with a latency budget.
 */
const SCAN_TIMEOUT_MS = 60_000;

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
    }, SCAN_TIMEOUT_MS);
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
    }, SCAN_TIMEOUT_MS);
  });

  describe('Server Action Surface', () => {
    it("no file outside src/actions should carry a 'use server' directive (module or function level)", async () => {
      const srcFiles = await glob('**/*.{ts,tsx}', {
        cwd: SRC_DIR,
        ignore: ['actions/**'],
      });
      const violations: string[] = [];

      for (const file of srcFiles) {
        const relative = `src/${file.replace(/\\/g, '/')}`;
        if (USE_SERVER_OUTSIDE_ACTIONS_ALLOWLIST.includes(relative)) continue;

        const content = fs.readFileSync(path.join(SRC_DIR, file), 'utf-8');
        if (hasTopLevelUseServer(content) || hasUseServerDirectiveLine(content)) {
          violations.push(relative);
        }
      }

      expect(
        violations,
        `Files outside src/actions/** with a 'use server' directive (top-level or inside a function):\n${violations.join('\n')}\n\n` +
          `Every export of such a file is a callable server action that the permission/audit scans never see. ` +
          `Remove the directive (server-only libraries do not need it), move the actions under src/actions/**, ` +
          `or add the file to USE_SERVER_OUTSIDE_ACTIONS_ALLOWLIST with a reason.`
      ).toHaveLength(0);
    }, SCAN_TIMEOUT_MS);
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
