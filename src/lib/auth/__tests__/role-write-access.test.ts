import { describe, expect, it } from 'vitest';
import { deriveRoleKey, roleActionAccess, roleWriteBlock } from '@/lib/auth/role-write-access';

// #1318: the one rule behind the Roles tab buttons and the role actions' rank guard.

const superAdmin = { roleName: 'super_admin', roleId: 'r-sa' };
const treasurer = { roleName: 'treasurer', roleId: 'r-treasurer' };
const unknownCaller = { roleName: null, roleId: null };

const SUPER_ADMIN = { id: 'r-sa', name: 'super_admin', is_system_role: true };
const CHAIRMAN = { id: 'r-ch', name: 'chairman', is_system_role: true };
const UNFLAGGED_SUPER_ADMIN = { id: 'r-x', name: 'super_admin', is_system_role: false };
const TREASURER = { id: 'r-treasurer', name: 'treasurer', is_system_role: false };
const AUDITOR = { id: 'r-auditor', name: 'auditor', is_system_role: false };

describe('roleWriteBlock', () => {
  it('lets a super admin write any role, their own included', () => {
    for (const role of [SUPER_ADMIN, CHAIRMAN, TREASURER, AUDITOR]) {
      expect(roleWriteBlock(superAdmin, role)).toBeNull();
    }
  });

  it('refuses anyone else a system role, a role named super_admin, or a missing role', () => {
    expect(roleWriteBlock(treasurer, CHAIRMAN)).toBe('rank');
    expect(roleWriteBlock(treasurer, SUPER_ADMIN)).toBe('rank');
    expect(roleWriteBlock(treasurer, UNFLAGGED_SUPER_ADMIN)).toBe('rank');
    expect(roleWriteBlock(treasurer, null)).toBe('rank');
  });

  it("refuses a non-super admin their own role, and allows another custom role", () => {
    expect(roleWriteBlock(treasurer, TREASURER)).toBe('own');
    expect(roleWriteBlock(treasurer, AUDITOR)).toBeNull();
  });

  it('treats a caller with no role id as not holding the role', () => {
    expect(roleWriteBlock(unknownCaller, AUDITOR)).toBeNull();
    expect(roleWriteBlock(unknownCaller, CHAIRMAN)).toBe('rank');
  });
});

describe('roleActionAccess (button visibility)', () => {
  const withManage = (caller: typeof treasurer) => ({ ...caller, canManageRoles: true });

  it('shows nothing without system.manage_roles, even to a super admin', () => {
    expect(roleActionAccess({ ...superAdmin, canManageRoles: false }, AUDITOR)).toEqual({
      canEdit: false,
      canManageAccess: false,
      canDelete: false,
    });
  });

  it('shows Edit, Manage access and Delete on another custom role', () => {
    expect(roleActionAccess(withManage(treasurer), AUDITOR)).toEqual({
      canEdit: true,
      canManageAccess: true,
      canDelete: true,
    });
  });

  it('shows nothing on a system role to a non-super admin', () => {
    expect(roleActionAccess(withManage(treasurer), CHAIRMAN)).toEqual({
      canEdit: false,
      canManageAccess: false,
      canDelete: false,
    });
  });

  it("shows nothing on the caller's own role to a non-super admin", () => {
    expect(roleActionAccess(withManage(treasurer), TREASURER)).toEqual({
      canEdit: false,
      canManageAccess: false,
      canDelete: false,
    });
  });

  it('lets a super admin edit a system role but never delete one', () => {
    expect(roleActionAccess(withManage(superAdmin), CHAIRMAN)).toEqual({
      canEdit: true,
      canManageAccess: true,
      canDelete: false,
    });
    expect(roleActionAccess(withManage(superAdmin), SUPER_ADMIN).canDelete).toBe(false);
  });

  it('hides Delete on a role named super_admin even when it is not flagged system', () => {
    expect(roleActionAccess(withManage(superAdmin), UNFLAGGED_SUPER_ADMIN).canDelete).toBe(false);
  });

  it("hides Delete on the caller's own role, even for a super admin (deleteRole refuses a held role)", () => {
    const ownCustom = { id: 'r-own', name: 'own', is_system_role: false };
    expect(
      roleActionAccess({ roleName: 'super_admin', roleId: 'r-own', canManageRoles: true }, ownCustom).canDelete
    ).toBe(false);
  });
});

describe('deriveRoleKey', () => {
  it.each([
    ['Estate Treasurer', 'estate_treasurer'],
    ['  Trésorier  Général ', 'tresorier_general'],
    ['Señor Oga-Ọlọ́run', 'senor_ogaolorun'],
    ['Zoë 2', 'zoe_2'],
    ['_Lead__Guard_', 'lead_guard'],
  ])('derives %j as %j', (raw, key) => {
    expect(deriveRoleKey(raw)).toBe(key);
  });

  it.each(['', '   ', '主席', 'Ω', '---'])('returns null for %j, which has no usable letters', (raw) => {
    expect(deriveRoleKey(raw)).toBeNull();
  });
});
