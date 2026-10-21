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
import {
  analyzeProject,
  findViolations,
  type FileAnalysis,
  type Violation,
} from '../helpers/action-scanner';

const ACTIONS_DIR = path.join(process.cwd(), 'src/actions');

// Files that are known exceptions (read-only, exports, type definitions, etc.)
const GENERAL_EXCEPTIONS = [
  'types.ts',
  'helpers.ts',
];

// Files that don't need audit logging (read-only or export operations)
const AUDIT_ONLY_EXCEPTIONS = [...GENERAL_EXCEPTIONS, 'export.ts', 'export-'];

// Known gaps that are still allowlisted.
//
// The scan is per ACTION (#390): every exported async function that writes is
// judged on its own, parsed with the TypeScript AST (see
// src/__tests__/helpers/action-scanner.ts). An entry is
// `relative/path.ts::functionName`. A bare `relative/path.ts` entry exempts
// every function in the file; that form is reserved for the permanent,
// deliberate entries below (self-service, cron, webhook, pre-auth). New entries
// MUST be file::function. There is no filename-prefix exemption: a file named
// get-*.ts that writes is checked like any other (#458).
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
  'payments/submit-payment-proof.ts',
  'billing/pay-invoice-with-wallet.ts',
  'billing/pay-multiple-invoices-with-wallet.ts',
  'paystack/initialize-payment.ts',
  'paystack/verify-payment.ts',
  // Unauthenticated Paystack webhook: auth is the webhook signature.
  'paystack/webhook-handler.ts',
  // Pre-auth: runs before the caller has a session.
  'auth/register-resident-portal.ts',
  'two-factor/verify.ts',
  // Read operations whose only write is their own access log / read receipt.
  'documents/download-document.ts',
  'announcements/read-receipts.ts',

  // ---- Own-rows self-service and by-design exemptions (#390 triage, #556).
  // These authenticate with getUser() and restrict every write to the caller's own
  // rows, so an admin RBAC permission would be wrong.
  'settings/theme-preferences.ts::setUserThemeOverride',
  'report-subscriptions/update-subscription.ts::updateMyReportSubscription',
  'in-app-notifications/update-notification.ts::markNotificationAsRead',
  'in-app-notifications/update-notification.ts::markAllNotificationsAsRead',
  'in-app-notifications/update-notification.ts::deleteNotification',
  'in-app-notifications/update-notification.ts::deleteReadNotifications',
  // Admin ending or logging against their own impersonation session (ownership checked).
  'impersonation/index.ts::endImpersonationSession',
  'impersonation/index.ts::logImpersonationPageView',
  // Guarded through canImpersonate(), which calls authorizePermission() before the
  // first read; the scanner does not follow permission delegation.
  'impersonation/index.ts::startImpersonationSession',
  // Dual-mode (self-service or admin): the row is read first to decide which, and
  // non-owners are forced through HOUSES_ASSIGN_RESIDENT before any write.
  'residents/move-out-renter.ts::initiateRenterMoveOut',
  'residents/move-out-owner.ts::initiateOwnerMoveOut',
  // Token-authenticated, pre-auth. Wrong codes are capped at 5 attempts per code
  // (record_failed_verification_attempt, #556).
  'verification/verify-contact.ts::verifyContactToken',

  // ---- SURFACED BY #390, NOT YET FIXED. Tracked in #556. Remove an entry in the
  // same PR that fixes it; do not add to this block.
  'report-subscriptions/update-subscription.ts::createDefaultReportSubscription',
  'billing/wallet.ts::getOrCreateWallet',
];

const AUDIT_ALLOWLIST = [
  // logAudit() attributes an entry to the acting user from the session and
  // no-ops without one, so these flows cannot produce a meaningful entry here.
  //
  // Pre-auth: runs before the caller has a session.
  'auth/register-resident-portal.ts',
  // Pre-auth 2FA login flow: writes its own two_factor_audit_log instead.
  'two-factor/verify.ts',

  // ---- Reads that the write-pattern scan sees as writes.
  //
  // Issues signed storage URLs; its only write is its own document_access_logs
  // entry, which is that module's access trail.
  'documents/download-document.ts',
  // Per-resident read tracking. Auditing every announcement view would flood
  // the audit log without recording an administrative decision.
  'announcements/read-receipts.ts',

  // ---- Own-rows self-service or self-trail (#390 triage, #556).
  'report-subscriptions/update-subscription.ts::updateMyReportSubscription',
  'in-app-notifications/update-notification.ts::markNotificationAsRead',
  'in-app-notifications/update-notification.ts::markAllNotificationsAsRead',
  'in-app-notifications/update-notification.ts::deleteNotification',
  'in-app-notifications/update-notification.ts::deleteReadNotifications',
  // The page_views write is itself the impersonation audit trail.
  'impersonation/index.ts::logImpersonationPageView',
  // Setup and disable-code steps touch only the caller's own 2FA state; the confirm
  // and disable steps that change what is enabled do audit.
  'two-factor/setup.ts::initiateTwoFactorSetup',
  'two-factor/disable.ts::requestDisableCode',

  // ---- SURFACED BY #390, NOT YET FIXED. Tracked in #556. Remove an entry in the
  // same PR that fixes it; do not add to this block.
  'report-subscriptions/update-subscription.ts::createDefaultReportSubscription',
  'billing/wallet.ts::getOrCreateWallet',
];

/** Files that carry no actions to check at all (type and helper modules). */
function isGeneralException(filename: string): boolean {
  return GENERAL_EXCEPTIONS.includes(path.basename(filename));
}

/** Files exempt from the audit check: general exceptions plus export modules. */
function isAuditException(filename: string): boolean {
  const basename = path.basename(filename);
  return AUDIT_ONLY_EXCEPTIONS.some((ex) => basename.includes(ex));
}

/**
 * Parse every file under src/actions/** once and share the result between the
 * permission and audit tests. The whole project is parsed (not just write
 * files) because audit delegation follows calls into other action files.
 */
let scanPromise: Promise<{ project: Map<string, FileAnalysis>; violations: Violation[] }> | null =
  null;

function scanActions() {
  scanPromise ??= (async () => {
    const actionFiles = await glob('**/*.ts', { cwd: ACTIONS_DIR });
    const sources: Record<string, string> = {};
    for (const file of actionFiles) {
      sources[file.replace(/\\/g, '/')] = fs.readFileSync(path.join(ACTIONS_DIR, file), 'utf-8');
    }
    const project = analyzeProject(sources);
    const violations = findViolations(project, {
      permissionAllowlist: PERMISSION_ALLOWLIST,
      auditAllowlist: AUDIT_ALLOWLIST,
      skipPermission: isGeneralException,
      skipAudit: isAuditException,
    });
    return { project, violations };
  })();
  return scanPromise;
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
    it('all write actions should use authorizePermission before touching the database', async () => {
      const { violations: all } = await scanActions();
      const violations = all
        .filter((v) => v.check !== 'audit-missing')
        .map((v) => `src/actions/${v.id} (${v.check})`);

      expect(
        violations,
        `Write actions missing a permission check, or checking it after the first database operation:\n${violations.join('\n')}\n\n` +
          `Call authorizePermission() before the first database operation, or add 'path.ts::functionName' to PERMISSION_ALLOWLIST in test file.`
      ).toHaveLength(0);
    }, SCAN_TIMEOUT_MS);
  });

  describe('Audit Logging', () => {
    it('all write actions should use logAudit (or delegate to an action that does)', async () => {
      const { violations: all } = await scanActions();
      const violations = all
        .filter((v) => v.check === 'audit-missing')
        .map((v) => `src/actions/${v.id}`);

      expect(
        violations,
        `Write actions missing audit logging:\n${violations.join('\n')}\n\n` +
          `Add logAudit calls or add 'path.ts::functionName' to AUDIT_ALLOWLIST in test file.`
      ).toHaveLength(0);
    }, SCAN_TIMEOUT_MS);
  });

  describe('Bulk payment verification (#812)', () => {
    it('scans bulkVerifyPayments as a guarded, audited write action with no allowlist entry', async () => {
      const id = 'finance/manual-verification.ts::bulkVerifyPayments';
      const { project } = await scanActions();
      const fn = project
        .get('finance/manual-verification.ts')
        ?.functions.find((f) => f.name === 'bulkVerifyPayments');

      expect(fn, `${id} was not found by the action scan`).toBeDefined();
      expect(fn!.exported && fn!.isAsync && fn!.isWrite).toBe(true);
      expect(fn!.guardPos).not.toBeNull();
      expect(fn!.guardPos!).toBeLessThan(fn!.firstDbOpPos!);
      expect(fn!.hasAudit).toBe(true);
      expect(PERMISSION_ALLOWLIST).not.toContain(id);
      expect(AUDIT_ALLOWLIST).not.toContain(id);
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
      console.log(`   Permission gaps: ${PERMISSION_ALLOWLIST.length} entries`);
      console.log(`   Audit gaps: ${AUDIT_ALLOWLIST.length} entries`);
      console.log('\n   Remove items from allowlists as they are fixed.\n');

      // Track progress over time - these should decrease
      expect(PERMISSION_ALLOWLIST.length).toBeGreaterThanOrEqual(0);
      expect(AUDIT_ALLOWLIST.length).toBeGreaterThanOrEqual(0);
    });
  });
});
