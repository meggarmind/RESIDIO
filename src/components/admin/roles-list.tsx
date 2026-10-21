'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  useRolesWithPermissions,
  useCreateRoleWithPermissions,
  useUpdateRole,
  useDeleteRole,
  usePermissions,
  useAdminTitles,
} from '@/hooks/use-roles';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Plus, Loader2, Pencil, Trash2, Shield, Lock } from 'lucide-react';
import type { AppRoleWithPermissions, RoleCategory } from '@/types/database';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { ActiveStatusBadge, SettingsEmptyState, SettingsSkeleton } from '@/components/settings/settings-states';
import { RolePermissionsDialog } from './role-permissions-dialog';
import { PermissionPicker } from './permission-picker';
import { resolvePermissionCategory } from '@/config/permission-categories';

const CATEGORY_LABELS: Record<RoleCategory, string> = {
  exco: 'Executive Committee',
  bot: 'Board of Trustees',
  staff: 'Staff',
  resident: 'Resident',
};

/**
 * How many modules a role can reach at all. The privilege count alone does not
 * answer "what can this role do?" -- 12 privileges spread over 6 modules is a
 * different role from 12 concentrated in one.
 */
function moduleCount(role: AppRoleWithPermissions): number {
  return new Set(role.permissions.map((p) => resolvePermissionCategory(p.category))).size;
}

function SystemBadge() {
  return (
    <Badge variant="secondary" className="gap-1 text-xs">
      <Lock className="h-3 w-3" />
      System
    </Badge>
  );
}

export function RolesList() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.SYSTEM_MANAGE_ROLES);
  const { data: rolesData, isLoading } = useRolesWithPermissions();
  const { data: allTitles } = useAdminTitles();
  const titleNames = (role: AppRoleWithPermissions) =>
    (allTitles ?? []).filter((t) => t.role_id === role.id).map((t) => t.name);
  const { data: allPermissions, isLoading: permissionsLoading } = usePermissions();
  const createMutation = useCreateRoleWithPermissions();
  const updateMutation = useUpdateRole();
  const deleteMutation = useDeleteRole();

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete confirmation dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<AppRoleWithPermissions | null>(null);

  // Permissions dialog state
  const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<AppRoleWithPermissions | null>(null);

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<AppRoleWithPermissions | null>(null);
  const [formName, setFormName] = useState('');
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState<RoleCategory>('exco');
  const [formIsActive, setFormIsActive] = useState(true);
  // Permissions chosen while creating, and the role they were seeded from.
  const [formPermissionIds, setFormPermissionIds] = useState<Set<string>>(new Set());
  const [cloneFromId, setCloneFromId] = useState<string>('none');

  const isEditing = editingId !== null;
  const isSystemRole = editingRole?.is_system_role ?? false;

  const resetForm = () => {
    setEditingId(null);
    setEditingRole(null);
    setFormName('');
    setFormDisplayName('');
    setFormDescription('');
    setFormCategory('exco');
    setFormIsActive(true);
    setFormPermissionIds(new Set());
    setCloneFromId('none');
  };

  /** Seed the picker from an existing role, so "same as the Secretary, plus finance" is one click. */
  const handleCloneFrom = (roleId: string) => {
    setCloneFromId(roleId);
    const source = rolesData?.find((r) => r.id === roleId);
    setFormPermissionIds(new Set(source ? source.permissions.map((p) => p.id) : []));
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (role: AppRoleWithPermissions) => {
    setEditingId(role.id);
    setEditingRole(role);
    setFormName(role.name);
    setFormDisplayName(role.display_name);
    setFormDescription(role.description || '');
    setFormCategory(role.category);
    setFormIsActive(role.is_active);
    setIsDialogOpen(true);
  };

  const openPermissionsDialog = (role: AppRoleWithPermissions) => {
    setSelectedRole(role);
    setPermissionsDialogOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      resetForm();
    }
    setIsDialogOpen(open);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formDisplayName.trim()) return;
    if (!isEditing && !formName.trim()) return;

    setIsSubmitting(true);
    try {
      if (isEditing) {
        // Update existing role
        await updateMutation.mutateAsync({
          id: editingId!,
          data: {
            display_name: formDisplayName,
            description: formDescription || null,
            // Only include these if not a system role
            ...(isSystemRole ? {} : {
              category: formCategory,
            }),
            is_active: formIsActive,
          },
        });
      } else {
        // Create new role - convert display name to snake_case for name
        const roleName = formName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        await createMutation.mutateAsync({
          role: {
            name: roleName,
            display_name: formDisplayName,
            description: formDescription || undefined,
            category: formCategory,
            is_active: formIsActive,
          },
          permissionIds: Array.from(formPermissionIds),
        });
      }
      setIsDialogOpen(false);
      resetForm();
    } catch {
      // Error already handled by mutation hooks
    } finally {
      setIsSubmitting(false);
    }
  };

  const openDeleteDialog = (role: AppRoleWithPermissions) => {
    setRoleToDelete(role);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!roleToDelete) return;
    await deleteMutation.mutateAsync(roleToDelete.id);
    setDeleteDialogOpen(false);
    setRoleToDelete(null);
  };

  const accessButton = (role: AppRoleWithPermissions) => (
    <Button
      variant="outline"
      size="sm"
      className="min-h-11 gap-1.5 hover:border-primary hover:bg-primary/10 md:min-h-8"
      onClick={() => openPermissionsDialog(role)}
    >
      <Shield className="h-4 w-4" />
      <span>
        {moduleCount(role)} module{moduleCount(role) !== 1 ? 's' : ''} ·{' '}
        {role.permissions.length} privilege
        {role.permissions.length !== 1 ? 's' : ''}
      </span>
    </Button>
  );

  // Resident-category roles are not administrators, so the Administrators tab would list nobody.
  const holders = (role: AppRoleWithPermissions) =>
    role.user_count == null ? (
      <span className="text-sm text-muted-foreground">—</span>
    ) : role.user_count > 0 && role.category !== 'resident' ? (
      <Link
        href={`/system/accounts?tab=administrators&role=${encodeURIComponent(role.name)}`}
        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        aria-label={`${role.user_count} ${role.user_count === 1 ? 'holder' : 'holders'} of ${role.display_name}`}
      >
        {role.user_count}
      </Link>
    ) : (
      <span className="text-sm">{role.user_count}</span>
    );

  const roleActions = (role: AppRoleWithPermissions) => {
    if (!canManage || role.name === 'super_admin') {
      return <span className="text-sm text-muted-foreground">—</span>;
    }
    return (
      <div className="flex justify-end gap-1">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-11 md:size-8"
                onClick={() => openEditDialog(role)}
                aria-label={`Edit role ${role.display_name}`}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit role</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {!role.is_system_role && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11 md:size-8 text-destructive hover:text-destructive"
                  onClick={() => openDeleteDialog(role)}
                  aria-label={`Delete role ${role.display_name}`}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete role</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    );
  };

  const holderCount = roleToDelete?.user_count;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Roles</h3>
        {canManage && (
        <Dialog open={isDialogOpen} onOpenChange={handleDialogClose}>
          <DialogTrigger asChild>
            <Button size="sm" className="min-h-11 md:min-h-8" onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Add Role
            </Button>
          </DialogTrigger>
          <DialogContent className={isEditing ? 'max-w-md' : 'flex max-h-[88vh] max-w-3xl flex-col'}>
            <DialogHeader>
              <DialogTitle>
                {isEditing ? 'Edit Role' : 'Add New Role'}
              </DialogTitle>
              <DialogDescription>
                {isEditing
                  ? isSystemRole
                    ? 'System roles have limited editable fields.'
                    : 'Update the role details below.'
                  : 'Name the role, then choose the modules and privileges it should have.'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className={isEditing ? undefined : 'flex min-h-0 flex-1 flex-col'}>
              <div className={isEditing ? 'grid gap-4 py-4' : 'grid min-h-0 flex-1 gap-4 overflow-y-auto py-4'}>
                {!isEditing && (
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="name" className="text-right">
                      Name*
                    </Label>
                    <Input
                      id="name"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="col-span-3"
                      placeholder="e.g. treasurer"
                      required
                    />
                  </div>
                )}
                {isEditing && (
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-right">Name</Label>
                    <div className="col-span-3 flex items-center gap-2">
                      <code className="text-sm bg-muted px-2 py-1 rounded">
                        {formName}
                      </code>
                      {isSystemRole && (
                        <Badge variant="secondary" className="gap-1">
                          <Lock className="h-3 w-3" />
                          System
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="display_name" className="text-right">
                    Display Name*
                  </Label>
                  <Input
                    id="display_name"
                    value={formDisplayName}
                    onChange={(e) => setFormDisplayName(e.target.value)}
                    className="col-span-3"
                    placeholder="e.g. Estate Treasurer"
                    required
                  />
                </div>
                <div className="grid grid-cols-4 items-start gap-4">
                  <Label htmlFor="description" className="text-right pt-2">
                    Description
                  </Label>
                  <Textarea
                    id="description"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="col-span-3"
                    placeholder="Brief description of the role's responsibilities"
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="category" className="text-right">
                    Category
                  </Label>
                  <Select
                    value={formCategory}
                    onValueChange={(value) => setFormCategory(value as RoleCategory)}
                    disabled={isSystemRole}
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="exco">Executive Committee</SelectItem>
                      <SelectItem value="bot">Board of Trustees</SelectItem>
                      <SelectItem value="staff">Staff</SelectItem>
                      <SelectItem value="resident">Resident</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="is_active" className="text-right">
                    Active
                  </Label>
                  <div className="col-span-3 flex items-center gap-2">
                    <Switch
                      id="is_active"
                      checked={formIsActive}
                      onCheckedChange={setFormIsActive}
                    />
                    <span className="text-sm text-muted-foreground">
                      {formIsActive ? 'Role is active' : 'Role is inactive'}
                    </span>
                  </div>
                </div>

                {!isEditing && (
                  <div className="space-y-3 border-t pt-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-medium">Access</h4>
                        <p className="text-sm text-muted-foreground">
                          Grant whole modules, or open one to pick individual privileges.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor="clone_from" className="whitespace-nowrap text-sm">
                          Start from
                        </Label>
                        <Select value={cloneFromId} onValueChange={handleCloneFrom}>
                          <SelectTrigger id="clone_from" className="w-[220px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No access</SelectItem>
                            {rolesData?.map((r) => (
                              <SelectItem key={r.id} value={r.id}>
                                {r.display_name} ({r.permissions.length})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <PermissionPicker
                      permissions={allPermissions}
                      isLoading={permissionsLoading}
                      value={formPermissionIds}
                      onChange={setFormPermissionIds}
                    />
                  </div>
                )}
              </div>
              <DialogFooter className={isEditing ? undefined : 'items-center justify-between border-t pt-4 sm:justify-between'}>
                {!isEditing && (
                  <span className="text-sm text-muted-foreground">
                    {formPermissionIds.size} privilege{formPermissionIds.size !== 1 ? 's' : ''} selected
                  </span>
                )}
                <Button type="submit" disabled={isSubmitting || updateMutation.isPending}>
                  {(isSubmitting || updateMutation.isPending) && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {isEditing ? 'Save Changes' : 'Create Role'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        )}
      </div>

      {isLoading ? (
        <SettingsSkeleton rows={4} />
      ) : !rolesData || rolesData.length === 0 ? (
        <SettingsEmptyState icon={Shield} title="No roles yet" />
      ) : (
        <>
          {/* Phone: one card per role so Edit and Delete are not last in a scrolled table (#788). */}
          <ul className="space-y-3 md:hidden">
            {rolesData.map((role) => (
              <li key={role.id} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{role.display_name}</span>
                      {role.is_system_role && <SystemBadge />}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {CATEGORY_LABELS[role.category]}
                    </p>
                    {titleNames(role).length > 0 && (
                      <p className="text-xs text-muted-foreground">Titles: {titleNames(role).join(', ')}</p>
                    )}
                  </div>
                  <ActiveStatusBadge active={role.is_active} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Holders: {holders(role)}</p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  {accessButton(role)}
                  {roleActions(role)}
                </div>
              </li>
            ))}
          </ul>
          <div className="hidden rounded-md border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-center">Access</TableHead>
                  <TableHead className="w-[80px] text-center">Holders</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                  {canManage && <TableHead className="w-[100px] text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rolesData.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell className="whitespace-normal">
                      <div className="flex flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{role.display_name}</span>
                          {role.is_system_role && <SystemBadge />}
                        </div>
                        <code className="text-xs text-muted-foreground">
                          {role.name}
                        </code>
                        {/* Category lives here, not in its own column, so Actions fit the 1440 column (#788). */}
                        <span className="text-xs text-muted-foreground">
                          {CATEGORY_LABELS[role.category]}
                        </span>
                        {titleNames(role).length > 0 && (
                          <span className="text-xs text-muted-foreground">
                            Titles: {titleNames(role).join(', ')}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">{accessButton(role)}</TableCell>
                    <TableCell className="text-center">{holders(role)}</TableCell>
                    <TableCell>
                      <ActiveStatusBadge active={role.is_active} />
                    </TableCell>
                    {canManage && <TableCell className="text-right">{roleActions(role)}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Role</AlertDialogTitle>
            <AlertDialogDescription>
              {holderCount
                ? `${holderCount} ${holderCount === 1 ? 'user holds' : 'users hold'} "${roleToDelete?.display_name}". Reassign them before deleting the role.`
                : holderCount === 0
                  ? `No users hold "${roleToDelete?.display_name}". Deleting it cannot be undone.`
                  : `Are you sure you want to delete "${roleToDelete?.display_name}"? This action cannot be undone. Any users assigned to this role will need to be reassigned.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRoleToDelete(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending || !!holderCount}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Permissions Dialog */}
      {selectedRole && (
        <RolePermissionsDialog
          role={selectedRole}
          open={permissionsDialogOpen}
          onOpenChange={setPermissionsDialogOpen}
        />
      )}
    </div>
  );
}
