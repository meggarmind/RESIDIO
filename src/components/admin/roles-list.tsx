'use client';

import { useState } from 'react';
import {
  useRolesWithPermissions,
  useCreateRole,
  useUpdateRole,
  useDeleteRole,
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
import { RolePermissionsDialog } from './role-permissions-dialog';

const CATEGORY_LABELS: Record<RoleCategory, string> = {
  exco: 'Executive Committee',
  bot: 'Board of Trustees',
  staff: 'Staff',
  resident: 'Resident',
};

export function RolesList() {
  const { data: rolesData, isLoading } = useRolesWithPermissions();
  const createMutation = useCreateRole();
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
  const [formLevel, setFormLevel] = useState(5);
  const [formIsActive, setFormIsActive] = useState(true);

  const isEditing = editingId !== null;
  const isSystemRole = editingRole?.is_system_role ?? false;

  const resetForm = () => {
    setEditingId(null);
    setEditingRole(null);
    setFormName('');
    setFormDisplayName('');
    setFormDescription('');
    setFormCategory('exco');
    setFormLevel(5);
    setFormIsActive(true);
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
    setFormLevel(role.level);
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
              level: formLevel,
            }),
            is_active: formIsActive,
          },
        });
      } else {
        // Create new role - convert display name to snake_case for name
        const roleName = formName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        await createMutation.mutateAsync({
          name: roleName,
          display_name: formDisplayName,
          description: formDescription || undefined,
          category: formCategory,
          level: formLevel,
          is_active: formIsActive,
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Roles</h3>
        <Dialog open={isDialogOpen} onOpenChange={handleDialogClose}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Add Role
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {isEditing ? 'Edit Role' : 'Add New Role'}
              </DialogTitle>
              <DialogDescription>
                {isEditing
                  ? isSystemRole
                    ? 'System roles have limited editable fields.'
                    : 'Update the role details below.'
                  : 'Create a new role for estate administration.'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4">
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
                  <Label htmlFor="level" className="text-right">
                    Level
                  </Label>
                  <div className="col-span-3 flex items-center gap-2">
                    <Input
                      id="level"
                      type="number"
                      min={0}
                      max={10}
                      value={formLevel}
                      onChange={(e) => setFormLevel(parseInt(e.target.value) || 0)}
                      className="w-20"
                      disabled={isSystemRole}
                    />
                    <span className="text-sm text-muted-foreground">
                      (0 = highest, 10 = lowest)
                    </span>
                  </div>
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
              </div>
              <DialogFooter>
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
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Role</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-center">Level</TableHead>
              <TableHead className="text-center">Permissions</TableHead>
              <TableHead className="w-[100px]">Status</TableHead>
              <TableHead className="w-[150px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : rolesData?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  No roles found.
                </TableCell>
              </TableRow>
            ) : (
              rolesData?.map((role) => (
                <TableRow key={role.id}>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{role.display_name}</span>
                        {role.is_system_role && (
                          <Badge variant="secondary" className="gap-1 text-xs">
                            <Lock className="h-3 w-3" />
                            System
                          </Badge>
                        )}
                      </div>
                      <code className="text-xs text-muted-foreground">
                        {role.name}
                      </code>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{CATEGORY_LABELS[role.category]}</span>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline">{role.level}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 hover:bg-primary/10 hover:border-primary"
                      onClick={() => openPermissionsDialog(role)}
                    >
                      <Shield className="h-4 w-4" />
                      <span>{role.permissions.length}</span>
                      <span className="text-xs text-muted-foreground">Edit</span>
                    </Button>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        role.is_active
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
                      }`}
                    >
                      {role.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {role.name === 'super_admin' ? (
                      <span className="text-sm text-muted-foreground">—</span>
                    ) : (
                      <div className="flex justify-end gap-1">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => openEditDialog(role)}
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
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  onClick={() => openDeleteDialog(role)}
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
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Role</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{roleToDelete?.display_name}&quot;?
              This action cannot be undone. Any users assigned to this role will need
              to be reassigned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRoleToDelete(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
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
