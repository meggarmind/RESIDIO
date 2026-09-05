import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { PERMISSIONS } from '@/lib/auth/action-roles';

/**
 * Issue #188 replaced every server-side authorization check that read the
 * legacy `profiles.role` column with a permission-based
 * `authorizePermission()` (or, at the two dual-path sites, a
 * `getCurrentUserPermissions()` check that stays deliberately separate from
 * the resident branch it sits beside) with `authorizeAction()`/`ACTION_ROLES`
 * deleted outright once nothing called them.
 *
 * A subset-style assertion ("does this function require at least X") cannot
 * catch a *narrowing* of who holds a permission, or a swap to the wrong
 * permission constant. These tests pin the exact mapping with `toEqual`,
 * following audit-queue-permission-guards.test.ts's shape, so any change
 * here is deliberate and reviewed rather than silently passing a "contains"
 * check.
 *
 * No database connection: reads source files off disk only.
 */

function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8');
}

const updateHouseSource = read('actions/houses/update-house.ts');
const deleteHouseSource = read('actions/houses/delete-house.ts');
const updatePaymentSource = read('actions/payments/update-payment.ts');
const deletePaymentSource = read('actions/payments/delete-payment.ts');
const updateStreetSource = read('actions/reference/update-street.ts');
const deleteStreetSource = read('actions/reference/delete-street.ts');
const updateHouseTypeSource = read('actions/reference/update-house-type.ts');
const approvalsIndexSource = read('actions/approvals/index.ts');
const developerOwnerApprovalsSource = read('actions/approvals/developer-owner-approvals.ts');
const reportEngineSource = read('actions/reports/report-engine.ts');
const financialOverviewActionSource = read('actions/reports/get-financial-overview.ts');
const backfillOwnershipHistorySource = read('actions/settings/backfill-ownership-history.ts');
const reportsPageSource = read('app/(dashboard)/reports/page.tsx');
const financialOverviewPageSource = read('app/(dashboard)/reports/financial-overview/page.tsx');
const getStaffSource = read('actions/settings/get-staff.ts');
const adminNotifierSource = read('lib/notifications/admin-notifier.ts');

/**
 * Strips `//` and `/* *\/`-style comments from TypeScript source, leaving
 * string and template literals untouched, so a doc comment naming a
 * permission constant above one export cannot be mistaken for that export's
 * own (or a neighbouring export's) guard.
 */
function stripComments(src: string): string {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (c === '/' && c2 === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && c2 === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i = Math.min(i + 2, n);
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      out += c;
      i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\' && i + 1 < n) {
          out += src[i] + src[i + 1];
          i += 2;
          continue;
        }
        out += src[i];
        i++;
      }
      if (i < n) {
        out += src[i];
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * Maps every top-level declaration (exported or not, default-exported or
 * named, async function/plain function/const) in a file to the
 * `PERMISSIONS.<KEY>` its body passes to a *qualifying* `authorizePermission`
 * call, or `null` if there is none.
 *
 * A call only qualifies if BOTH hold:
 *  1. It is the first *meaningful* `await` in the declaration's own body
 *     (its slice runs from this declaration's start to the next top-level
 *     declaration's start). Unlike get-audit-logs.ts/queue.ts, this
 *     codebase's house style in these files puts `const supabase = await
 *     createServerSupabaseClient()` (or `createAdminClient()`) ahead of the
 *     guard, so those two setup calls are stripped before looking for
 *     "first" -- otherwise every real guard here would be misreported as
 *     "not first" and the test would report false negatives, not catch
 *     regressions.
 *  2. It is followed, within a short window, by
 *     `if (!x.authorized) { ... return ... }`.
 *
 * Declarations that guard some other way (a dual-path resident check, or a
 * boolean-returning helper that hands back `auth.authorized` directly
 * without an early return) deliberately report `null` here -- they are
 * pinned by their own dedicated assertions below instead, so this generic
 * scan cannot be fooled into treating "some `authorizePermission` call
 * appears somewhere in this function" as equivalent to "this function is
 * gated by it".
 *
 * Every top-level declaration is enumerated, not just the ones this slice
 * touched, so an unexpected new one shows up as an extra key and breaks the
 * `toEqual` pin instead of silently passing unseen.
 */
function extractPermissionGuards(rawSource: string): Record<string, string | null> {
  const source = stripComments(rawSource);
  const declRe = /^(?:export\s+(?:default\s+)?)?(?:async\s+function\s+(\w+)\s*\(|function\s+(\w+)\s*\(|const\s+(\w+)\s*=)/gm;
  const matches = [...source.matchAll(declRe)];

  const map: Record<string, string | null> = {};

  for (let idx = 0; idx < matches.length; idx++) {
    const m = matches[idx];
    const name = (m[1] ?? m[2] ?? m[3])!;
    const start = m.index!;
    const end = idx + 1 < matches.length ? matches[idx + 1].index! : source.length;
    const rawBody = source.slice(start, end);
    // Neutralise the two setup awaits so they cannot count as "first".
    const body = rawBody.replace(/await\s+create(?:ServerSupabaseClient|AdminClient)\(\)/g, 'SETUP_CALL()');

    const firstAwait = body.match(/\bawait\b/);
    const permCall = body.match(/await\s+authorizePermission\(PERMISSIONS\.(\w+)\)/);

    if (!permCall || !firstAwait) {
      map[name] = null;
      continue;
    }

    const isFirstAwait = firstAwait.index === permCall.index;

    const afterPerm = body.slice(permCall.index!, permCall.index! + 300);
    const hasEarlyReturn = /if\s*\(\s*!\s*\w+\.authorized\s*\)\s*\{?[\s\S]{0,150}?\breturn\b/.test(afterPerm);

    map[name] = isFirstAwait && hasEarlyReturn ? permCall[1] : null;
  }

  return map;
}

describe('Part 1: the seven simple authorizeAction call sites', () => {
  it('updateHouse requires HOUSES_UPDATE', () => {
    expect(extractPermissionGuards(updateHouseSource)).toEqual({
      hasExistingDevelopmentLevy: null,
      updateHouse: 'HOUSES_UPDATE',
    });
  });

  it('deleteHouse requires HOUSES_DELETE', () => {
    expect(extractPermissionGuards(deleteHouseSource)).toEqual({ deleteHouse: 'HOUSES_DELETE' });
  });

  it('updatePayment requires PAYMENTS_UPDATE', () => {
    expect(extractPermissionGuards(updatePaymentSource)).toEqual({
      updatePaymentSchema: null,
      updatePayment: 'PAYMENTS_UPDATE',
    });
  });

  it('deletePayment requires PAYMENTS_DELETE', () => {
    expect(extractPermissionGuards(deletePaymentSource)).toEqual({ deletePayment: 'PAYMENTS_DELETE' });
  });

  it('updateStreet requires SETTINGS_MANAGE_REFERENCE', () => {
    expect(extractPermissionGuards(updateStreetSource)).toEqual({ updateStreet: 'SETTINGS_MANAGE_REFERENCE' });
  });

  it('deleteStreet requires SETTINGS_MANAGE_REFERENCE', () => {
    expect(extractPermissionGuards(deleteStreetSource)).toEqual({ deleteStreet: 'SETTINGS_MANAGE_REFERENCE' });
  });

  it('updateHouseType requires SETTINGS_MANAGE_REFERENCE', () => {
    expect(extractPermissionGuards(updateHouseTypeSource)).toEqual({ updateHouseType: 'SETTINGS_MANAGE_REFERENCE' });
  });

  it('none of the seven read profiles.role any more', () => {
    for (const src of [
      updateHouseSource,
      deleteHouseSource,
      updatePaymentSource,
      deletePaymentSource,
      updateStreetSource,
      deleteStreetSource,
      updateHouseTypeSource,
    ]) {
      expect(src).not.toContain('profile.role');
      expect(src).not.toContain('authorizeAction');
      expect(src).not.toContain('ACTION_ROLES');
    }
  });

  it('the pinned constants resolve to the expected permission strings', () => {
    expect(PERMISSIONS.HOUSES_UPDATE).toBe('houses.update');
    expect(PERMISSIONS.HOUSES_DELETE).toBe('houses.delete');
    expect(PERMISSIONS.PAYMENTS_UPDATE).toBe('payments.update');
    expect(PERMISSIONS.PAYMENTS_DELETE).toBe('payments.delete');
    expect(PERMISSIONS.SETTINGS_MANAGE_REFERENCE).toBe('settings.manage_reference');
  });
});

describe('Part 2: approvals/index.ts hand-rolled legacy checks', () => {
  it('pins which permission every top-level declaration requires', () => {
    expect(extractPermissionGuards(approvalsIndexSource)).toEqual({
      getApprovalRequests: 'APPROVALS_VIEW',
      // Soft-deny shape (count 0, error null on failure) still qualifies:
      // it is the first await and is followed by an early return.
      getPendingApprovalsCount: 'APPROVALS_VIEW',
      approveRequest: 'APPROVALS_APPROVE_REJECT',
      rejectRequest: 'APPROVALS_APPROVE_REJECT',
      // Internal helper invoked by approveRequest after its own guard has
      // already run -- must not carry a second, independently-driftable check.
      applyRequestedChanges: null,
      // Anyone can submit an approval request; only reviewing one is gated.
      createApprovalRequest: null,
      // Returns `auth.authorized` directly rather than an early return --
      // pinned separately below.
      canAutoApprove: null,
    });
  });

  it('canAutoApprove checks APPROVALS_APPROVE_REJECT and returns the boolean directly', () => {
    const body = approvalsIndexSource.slice(approvalsIndexSource.indexOf('export async function canAutoApprove'));
    expect(body).toContain('authorizePermission(PERMISSIONS.APPROVALS_APPROVE_REJECT)');
    expect(body).toContain('return auth.authorized;');
  });

  it('no longer reads the legacy profiles.role column for authorization', () => {
    expect(approvalsIndexSource).not.toContain("profile.role");
    expect(approvalsIndexSource).not.toContain("['admin', 'chairman']");
    expect(approvalsIndexSource).not.toContain('authorizeAction');
    expect(approvalsIndexSource).not.toContain('ACTION_ROLES');
    // getCurrentUserRole(), the legacy role getter this slice removed, had
    // zero callers anywhere in src/.
    expect(approvalsIndexSource).not.toContain('getCurrentUserRole');
  });

  it('the pinned constants resolve to the expected permission strings', () => {
    expect(PERMISSIONS.APPROVALS_VIEW).toBe('approvals.view');
    expect(PERMISSIONS.APPROVALS_APPROVE_REJECT).toBe('approvals.approve_reject');
  });
});

describe('Part 3: developer-owner-approvals.ts dual-path and cron checks', () => {
  it('pins which permission every top-level declaration requires', () => {
    expect(extractPermissionGuards(developerOwnerApprovalsSource)).toEqual({
      checkRequiresApproval: null,
      createDeveloperOwnerApproval: null,
      // Dual-path admin-OR-affected-resident checks -- pinned separately
      // below, since a hard authorizePermission() early return here would
      // wrongly reject the legitimate resident branch.
      approveAsOccupier: null,
      rejectAsOccupier: null,
      processExpiredApprovals: 'APPROVALS_APPROVE_REJECT',
      getMyPendingApprovals: null,
      sendApprovalReminders: null,
      getActionLabel: null,
      formatRole: null,
    });
  });

  it.each(['approveAsOccupier', 'rejectAsOccupier'] as const)(
    '%s keeps the admin-OR-affected-resident dual path via getCurrentUserPermissions, not a hard guard',
    (fnName) => {
      const start = developerOwnerApprovalsSource.indexOf(`export async function ${fnName}`);
      const nextExport = developerOwnerApprovalsSource.indexOf('\nexport async function', start + 1);
      const body = developerOwnerApprovalsSource.slice(start, nextExport === -1 ? undefined : nextExport);

      // The permission check and the resident check are both present and
      // combined with OR, not gated behind an early-returning hard guard.
      expect(body).toContain('getCurrentUserPermissions()');
      expect(body).toContain('permissions.includes(PERMISSIONS.APPROVALS_APPROVE_REJECT)');
      expect(body).toContain('isAffectedResident');
      expect(body).toMatch(/if\s*\(\s*!isAdmin\s*&&\s*!isAffectedResident\s*\)/);
      expect(body).not.toContain('await authorizePermission(');
      // The resident half no longer needs the legacy role column.
      expect(body).not.toContain("select('role, resident_id')");
    }
  );

  it('no longer reads the legacy profiles.role column for authorization', () => {
    expect(developerOwnerApprovalsSource).not.toContain('profile?.role');
    expect(developerOwnerApprovalsSource).not.toContain("profile.role !== 'admin'");
    expect(developerOwnerApprovalsSource).not.toContain('authorizeAction');
    expect(developerOwnerApprovalsSource).not.toContain('ACTION_ROLES');
  });
});

describe('Part 2: report-engine.ts checkReportAccess', () => {
  it('pins which permission every top-level declaration requires', () => {
    expect(extractPermissionGuards(reportEngineSource)).toEqual({
      checkReportAccess: 'REPORTS_VIEW_FINANCIAL',
      generateFinancialOverview: null,
      generateCollectionReport: null,
      generateInvoiceAging: null,
      generateTransactionLog: null,
      generateDebtorsReport: null,
      generateIndebtednessReport: null,
      generateDevelopmentLevyReport: null,
      // Delegates its authorization entirely to checkReportAccess(),
      // verified below -- must not carry a second, independently-driftable
      // check of its own.
      generateReport: null,
    });
  });

  it('generateReport gates on checkReportAccess() as its first meaningful call', () => {
    const start = reportEngineSource.indexOf('export async function generateReport');
    const rawBody = reportEngineSource.slice(start);
    // Neutralise the setup await ahead of the guard, same as extractPermissionGuards.
    const body = rawBody.replace(/await\s+createServerSupabaseClient\(\)/g, 'SETUP_CALL()');
    const firstAwait = body.match(/\bawait\b/);
    const accessCall = body.match(/await\s+checkReportAccess\(\)/);
    expect(accessCall).not.toBeNull();
    expect(firstAwait?.index).toBe(accessCall!.index);
  });

  it('no longer reads the legacy profiles.role column for authorization', () => {
    expect(reportEngineSource).not.toContain('profile.role');
    expect(reportEngineSource).not.toContain("allowedRoles = ['admin', 'chairman', 'financial_secretary']");
  });
});

describe('Part 2: get-financial-overview.ts and backfill-ownership-history.ts', () => {
  it('pins which permission every top-level declaration requires', () => {
    expect(extractPermissionGuards(financialOverviewActionSource)).toEqual({
      getFinancialOverview: 'REPORTS_VIEW_FINANCIAL',
      getBankAccountsForFilter: null,
    });
    expect(extractPermissionGuards(backfillOwnershipHistorySource)).toEqual({
      backfillOwnershipHistory: 'SETTINGS_MANAGE_GENERAL',
    });
  });

  it('no longer read the legacy profiles.role column for authorization', () => {
    for (const src of [financialOverviewActionSource, backfillOwnershipHistorySource]) {
      expect(src).not.toContain('profile.role');
      expect(src).not.toContain('authorizeAction');
      expect(src).not.toContain('ACTION_ROLES');
    }
    expect(financialOverviewActionSource).not.toContain(
      "allowedRoles = ['admin', 'chairman', 'financial_secretary']"
    );
  });

  it('the pinned constants resolve to the expected permission strings', () => {
    expect(PERMISSIONS.REPORTS_VIEW_FINANCIAL).toBe('reports.view_financial');
    expect(PERMISSIONS.SETTINGS_MANAGE_GENERAL).toBe('settings.manage_general');
  });
});

/**
 * Report pages are Server Components, not server actions: they have a real
 * (non-setup) `await supabase.auth.getUser()` ahead of the permission check,
 * and their failure branch calls `redirect(...)` rather than `return`ing --
 * neither shape fits extractPermissionGuards above, so these get their own
 * small structural extractor instead of being forced through it.
 */
function extractPageGuard(src: string, exportName: string): { permission: string | null; failureAction: string | null } {
  const start = src.indexOf(`export default async function ${exportName}`);
  const body = src.slice(start);
  const permCall = body.match(/await\s+authorizePermission\(PERMISSIONS\.(\w+)\)/);
  if (!permCall) return { permission: null, failureAction: null };

  const afterPerm = body.slice(permCall.index!, permCall.index! + 200);
  const failureMatch = afterPerm.match(
    /if\s*\(\s*!\s*\w+\.authorized\s*\)\s*\{[\s\S]{0,100}?(redirect\('[^']+'\))/
  );
  return { permission: permCall[1], failureAction: failureMatch ? failureMatch[1] : null };
}

describe('Part 4: report page RBAC gates (not covered by module-integration.test.ts)', () => {
  it('pins which permission each page requires, and that failure redirects to /dashboard', () => {
    expect(extractPageGuard(reportsPageSource, 'ReportsPage')).toEqual({
      permission: 'REPORTS_VIEW_FINANCIAL',
      failureAction: "redirect('/dashboard')",
    });
    expect(extractPageGuard(financialOverviewPageSource, 'FinancialOverviewPage')).toEqual({
      permission: 'REPORTS_VIEW_FINANCIAL',
      failureAction: "redirect('/dashboard')",
    });
  });

  it('both pages keep the two distinct redirects (login when unauthenticated, dashboard when unpermitted)', () => {
    for (const src of [reportsPageSource, financialOverviewPageSource]) {
      expect(src).toContain("if (!user) {");
      expect(src).toContain("redirect('/login');");
      expect(src).not.toContain('allowedRoles');
      expect(src).not.toContain('authorizeAction');
      expect(src).not.toContain('ACTION_ROLES');
    }
  });
});

describe('Part 5: legacy role queries migrated to RBAC vocabulary', () => {
  it('get-staff.ts filters by app_roles.name, not the legacy profiles.role column', () => {
    expect(getStaffSource).not.toMatch(/\.in\(\s*'role'/);
    expect(getStaffSource).toContain("app_roles!inner(name)");
    expect(getStaffSource).toMatch(/\.in\(\s*'app_roles\.name',\s*\[\s*'super_admin',\s*'chairman'\s*\]\s*\)/);
  });

  it('admin-notifier.ts default-recipient fallback filters by app_roles.name, and fallbackRoles is gone', () => {
    expect(adminNotifierSource).not.toMatch(/\.in\(\s*'role'/);
    expect(adminNotifierSource).toContain("app_roles!inner(name)");
    expect(adminNotifierSource).toMatch(/\.in\(\s*'app_roles\.name',\s*\[\s*'super_admin',\s*'chairman'\s*\]\s*\)/);
    expect(adminNotifierSource).not.toContain('fallbackRoles');
  });

  it('the super_admin/chairman fallback only runs when no requiredPermission was given', () => {
    // A permission-scoped notification that finds no holders must not fall
    // through to super_admin/chairman -- that would notify people the
    // caller never asked for. Pin the guard condition itself, not just the
    // .in() filter it leads to, so widening it to `recipientIds.length === 0`
    // alone (dropping the `!params.requiredPermission`) fails this test.
    expect(adminNotifierSource).toContain(
      'if (recipientIds.length === 0 && !params.requiredPermission) {'
    );
  });
});

describe('authorizeAction() and ACTION_ROLES are deleted', () => {
  it('neither symbol is defined any more', () => {
    const authorizeSource = read('lib/auth/authorize.ts');
    const actionRolesSource = read('lib/auth/action-roles.ts');
    expect(authorizeSource).not.toContain('authorizeAction');
    expect(actionRolesSource).not.toContain('ACTION_ROLES');
  });
});
