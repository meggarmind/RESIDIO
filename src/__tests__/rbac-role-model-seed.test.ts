import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { ADMIN_ROLE_NAMES, PERMISSIONS } from '@/lib/auth/action-roles';

/**
 * Static checks on the role-model seed (#825, slice 3 of #822). Pins the text of the SQL (no
 * database): the new permission, the exact permission lists of the new roles, the chairman
 * removals, the owner's role_assignment_rules matrix and the retired roles. The behaviour under
 * the slice 1 trigger is verified by the migration's ROLLBACK probe.
 */

const root = fileURLToPath(new URL('../..', import.meta.url));

const sql = readFileSync(
  path.join(root, 'supabase/migrations/20261022160000_seed_rbac_role_model.sql'),
  'utf8'
)
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n');

/** The names in one `c_<name> constant text[] := ARRAY[...]` declaration. */
function list(name: string): string[] {
  const match = new RegExp(`\\b${name} constant text\\[\\] := ARRAY\\[([^\\]]*)\\]`).exec(sql);
  expect(match, `${name} is declared`).not.toBeNull();
  return [...(match as RegExpExecArray)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
}

describe('system.assign_board_roles', () => {
  it('exists as a permission constant', () => {
    expect(PERMISSIONS.SYSTEM_ASSIGN_BOARD_ROLES).toBe('system.assign_board_roles');
  });

  it('is seeded in the system category and held by super_admin only', () => {
    expect(sql).toMatch(/'system\.assign_board_roles',\s*'Assign Board Roles',[^)]*'system',\s*true/);
    expect(list('c_super_only')).toEqual([
      'impersonation.approve_requests',
      'impersonation.manage_settings',
      'system.assign_board_roles',
    ]);
    expect(sql).toMatch(/p\.name = ANY \(c_super_only\)\s*AND rp\.role_id <> v_super/);
  });
});

describe('permission sets', () => {
  it('chairman gains all six settings permissions, assign_roles and projects', () => {
    expect(list('c_chairman_add')).toEqual([
      'manage_projects',
      'settings.manage_billing',
      'settings.manage_general',
      'settings.manage_reference',
      'settings.manage_security',
      'settings.view',
      'settings.view_audit_logs',
      'system.assign_roles',
      'view_projects',
    ]);
  });

  it('chairman loses impersonation and every system permission except the two kept', () => {
    expect(list('c_chairman_system_kept')).toEqual(['system.assign_roles', 'system.view_all_profiles']);
    expect(sql).toMatch(
      /rp\.role_id = v_chairman\s*AND \(p\.name LIKE 'impersonation\.%'\s*OR \(p\.name LIKE 'system\.%' AND p\.name <> ALL \(c_chairman_system_kept\)\)\)/
    );
  });

  it('financial and security officers gain start_session and view_sessions', () => {
    expect(list('c_officer_add')).toEqual(['impersonation.start_session', 'impersonation.view_sessions']);
    expect(sql).toContain('(VALUES (v_financial), (v_security))');
  });

  it('welfare_officer holds exactly its list', () => {
    expect(list('c_welfare')).toEqual(
      [
        'residents.view',
        'houses.view',
        'announcements.view',
        'announcements.create',
        'announcements.update',
        'announcements.delete',
        'announcements.publish',
        'announcements.manage_categories',
        'announcements.manage_templates',
        'announcements.emergency_broadcast',
        'notes.view',
        'notes.create',
        'notes.update',
        'notes.delete',
        'notes.view_confidential',
        'notifications.view',
        'notifications.send',
        'notifications.manage',
        'notifications.manage_delivery',
        'documents.view',
      ].sort()
    );
  });

  it('trustee holds only view permissions and reports.export, nothing from settings', () => {
    const trustee = list('c_trustee');
    expect(trustee).toHaveLength(24);
    for (const name of trustee) {
      if (name === 'reports.export') continue;
      expect(name, name).toMatch(/(^|\.)view(_[a-z_]+)?$|^view_/);
    }
    expect(trustee.filter((n) => n.startsWith('settings.'))).toEqual([]);
    expect(trustee).toContain('reports.export');
  });

  it('security_guard_supervisor holds no configuration or delete permission', () => {
    expect(list('c_guard')).toEqual([
      'security.generate_codes',
      'security.operate_records',
      'security.record_access',
      'security.verify_codes',
      'security.view',
    ]);
  });

  it('removes anything else the new roles hold, and checks every named permission exists', () => {
    expect(sql).toMatch(/rp\.role_id = s\.role_id\s*AND p\.name <> ALL \(s\.perms\)/);
    expect(sql).toContain("RAISE EXCEPTION 'role model seed: permissions not in app_permissions: %'");
  });
});

describe('role_assignment_rules', () => {
  it('seeds the owner matrix for the six resident roles across the nine resident types', () => {
    expect(list('c_resident_types')).toEqual([
      'caretaker',
      'co_resident',
      'contractor',
      'developer',
      'domestic_staff',
      'household_member',
      'non_resident_landlord',
      'resident_landlord',
      'tenant',
    ]);

    const allowed = Object.fromEntries(
      [...sql.matchAll(/\((v_[a-z]+), ARRAY\[([^\]]*)\]\)/g)].map((m) => [
        m[1],
        [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort(),
      ])
    );
    const landlords = ['non_resident_landlord', 'resident_landlord'];
    expect(allowed).toEqual({
      v_chairman: landlords,
      v_trustee: landlords,
      v_security: [...landlords, 'tenant'].sort(),
      v_financial: [...landlords, 'co_resident', 'tenant'].sort(),
      v_secretary: [...landlords, 'co_resident', 'tenant'].sort(),
      v_welfare: [...landlords, 'co_resident', 'tenant'].sort(),
    });
  });

  it('deletes the super_admin and security_guard_supervisor rows', () => {
    expect(sql).toContain('WHERE app_role_id IN (v_super, v_guard)');
  });
});

describe('roles and titles', () => {
  it('flags the six resident roles, not super_admin or the guard supervisor', () => {
    expect(sql).toMatch(
      /SET requires_resident = true\s*WHERE name IN \('chairman', 'financial_officer', 'secretary', 'security_officer',\s*'welfare_officer', 'trustee'\)/
    );
    expect(sql).toMatch(/\('security_guard_supervisor', 'Security Guard Supervisor',[\s\S]*?'staff', 3, true, true, false, false\)/);
  });

  it('seeds the titles with their seats, Trustee unlimited', () => {
    const titles = [...sql.matchAll(/\('([a-z_]+)', '([A-Za-z ]+)', (true|false), (\d+|NULL::integer), \d\)/g)].map(
      (m) => `${m[1]}:${m[2]}:${m[3] === 'true' ? 'principal' : 'backup'}:${m[4] === 'NULL::integer' ? 'unlimited' : m[4]}`
    );
    expect(titles).toEqual([
      'chairman:Chairman:principal:1',
      'chairman:Vice Chairman:backup:1',
      'financial_officer:Treasurer:principal:1',
      'financial_officer:Financial Secretary:backup:1',
      'secretary:Secretary:principal:1',
      'secretary:Assistant Secretary:backup:1',
      'security_officer:Chief Security Officer:principal:1',
      'security_officer:Assistant Chief Security Officer:backup:1',
      'welfare_officer:Welfare Officer:principal:1',
      'trustee:Trustee:principal:unlimited',
      'security_guard_supervisor:Security Guard Supervisor:principal:1',
    ]);
  });

  it('moves vice_chairman holders to chairman with the Vice Chairman title, then deletes the retired roles', () => {
    expect(sql).toMatch(/SET role_id = v_chairman, title_id = v_vice_title\s*WHERE p\.role_id = v_vice/);
    expect(sql).toMatch(/SET role_id = NULL, title_id = NULL\s*WHERE p\.role_id IN \(v_project, v_resident\)/);
    expect(sql).toContain("RAISE EXCEPTION 'role model seed: a retired role still has holders'");
    expect(sql).toContain('DELETE FROM public.app_roles WHERE id IN (v_vice, v_project, v_resident)');
  });

  it('routes the new roles, and not the retired ones, to the dashboard', () => {
    expect(ADMIN_ROLE_NAMES).toEqual(
      expect.arrayContaining(['welfare_officer', 'trustee', 'security_guard_supervisor'])
    );
    for (const retired of ['vice_chairman', 'project_manager', 'resident']) {
      expect(ADMIN_ROLE_NAMES).not.toContain(retired);
    }
  });
});
