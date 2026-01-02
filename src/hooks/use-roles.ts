'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  getRolesWithPermissions,
  getRoleById,
  getAllPermissions,
  createRole,
  updateRole,
  deleteRole,
  updateRolePermissions,
  assignRoleToUser,
  getUsersWithRoles,
  getCurrentAdmins,
} from '@/actions/roles';
import type { AppRoleInsert, AppRoleUpdate } from '@/types/database';

// Query keys
const ROLES_KEY = ['roles'];
const PERMISSIONS_KEY = ['permissions'];
const USERS_WITH_ROLES_KEY = ['users-with-roles'];
const CURRENT_ADMINS_KEY = ['current-admins'];

/**
 * Fetch all roles with their permissions
 */
export function useRolesWithPermissions() {
  return useQuery({
    queryKey: ROLES_KEY,
    queryFn: async () => {
      const result = await getRolesWithPermissions();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
  });
}

/**
 * Fetch a single role by ID
 */
export function useRole(roleId: string) {
  return useQuery({
    queryKey: [...ROLES_KEY, roleId],
    queryFn: async () => {
      const result = await getRoleById(roleId);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
    enabled: !!roleId,
  });
}

/**
 * Fetch all available permissions
 */
export function usePermissions() {
  return useQuery({
    queryKey: PERMISSIONS_KEY,
    queryFn: async () => {
      const result = await getAllPermissions();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
  });
}

/**
 * Create a new role
 */
export function useCreateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: AppRoleInsert) => {
      const result = await createRole(data);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ROLES_KEY });
      toast.success('Role created successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create role');
    },
  });
}

/**
 * Update an existing role
 */
export function useUpdateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: AppRoleUpdate }) => {
      const result = await updateRole(id, data);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ROLES_KEY });
      queryClient.invalidateQueries({ queryKey: [...ROLES_KEY, variables.id] });
      toast.success('Role updated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update role');
    },
  });
}

/**
 * Delete a role
 */
export function useDeleteRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (roleId: string) => {
      const result = await deleteRole(roleId);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ROLES_KEY });
      toast.success('Role deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete role');
    },
  });
}

/**
 * Update permissions for a role
 */
export function useUpdateRolePermissions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      roleId,
      permissionIds,
    }: {
      roleId: string;
      permissionIds: string[];
    }) => {
      const result = await updateRolePermissions(roleId, permissionIds);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ROLES_KEY });
      queryClient.invalidateQueries({ queryKey: [...ROLES_KEY, variables.roleId] });
      toast.success('Role permissions updated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update role permissions');
    },
  });
}

/**
 * Assign a role to a user
 */
export function useAssignRoleToUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, roleId }: { userId: string; roleId: string }) => {
      const result = await assignRoleToUser(userId, roleId);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS_WITH_ROLES_KEY });
      toast.success('Role assigned successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to assign role');
    },
  });
}

/**
 * Fetch users with their roles
 */
export function useUsersWithRoles() {
  return useQuery({
    queryKey: USERS_WITH_ROLES_KEY,
    queryFn: async () => {
      const result = await getUsersWithRoles();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
  });
}

/**
 * Fetch current admins (users with non-resident roles)
 */
export function useCurrentAdmins() {
  return useQuery({
    queryKey: CURRENT_ADMINS_KEY,
    queryFn: async () => {
      const result = await getCurrentAdmins();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
  });
}

// =====================================================
// Role Assignment Rules
// =====================================================

import {
  getRulesByResidentRole,
  updateRoleAssignmentRule,
  batchUpdateRoleAssignmentRules,
} from '@/actions/roles/assignment-rules';
import type { ResidentRole } from '@/types/database';

const ASSIGNMENT_RULES_KEY = ['role-assignment-rules'];

/**
 * Fetch role assignment rules grouped by resident role
 */
export function useRoleAssignmentRules() {
  return useQuery({
    queryKey: ASSIGNMENT_RULES_KEY,
    queryFn: async () => {
      const result = await getRulesByResidentRole();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
  });
}

/**
 * Update a single role assignment rule
 */
export function useUpdateRoleAssignmentRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      residentRole,
      appRoleId,
      isAllowed,
    }: {
      residentRole: ResidentRole;
      appRoleId: string;
      isAllowed: boolean;
    }) => {
      const result = await updateRoleAssignmentRule(residentRole, appRoleId, isAllowed);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ASSIGNMENT_RULES_KEY });
      toast.success('Rule updated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update rule');
    },
  });
}

/**
 * Batch update multiple role assignment rules
 */
export function useBatchUpdateRoleAssignmentRules() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      updates: Array<{
        residentRole: ResidentRole;
        appRoleId: string;
        isAllowed: boolean;
      }>
    ) => {
      const result = await batchUpdateRoleAssignmentRules(updates);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ASSIGNMENT_RULES_KEY });
      toast.success('Rules updated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update rules');
    },
  });
}
