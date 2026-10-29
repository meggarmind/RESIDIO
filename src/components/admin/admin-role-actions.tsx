'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, UserMinus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAdminTitles, useAssignableRoles, useCurrentAdmins } from '@/hooks/use-roles';
import { assignRoleToProfile, removeRoleFromProfile } from '@/actions/roles/assign-role';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { permissionToManage } from '@/lib/auth/board-roles';
import { roleWithTitle } from '@/lib/auth/role-label';
import { RoleTitlePicker, grantableRoles, residentRoleBlock, roleListNotice } from './role-title-picker';

type CurrentAdmin = NonNullable<ReturnType<typeof useCurrentAdmins>['data']>[number];

/**
 * Change role and Remove role for one row of the Administrators list (#827).
 * Both reuse the assign-role actions, which enforce every guard; the checks
 * here use the same permissions so the buttons only appear when the action can succeed.
 */
export function AdminRoleActions({ admin }: { admin: CurrentAdmin }) {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const { data: roles, isLoading: rolesLoading, error: rolesError } = useAssignableRoles();
  const { data: titles, isLoading: titlesLoading, error: titlesError } = useAdminTitles();

  const [changeOpen, setChangeOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [roleId, setRoleId] = useState(admin.role_id);
  const [titleId, setTitleId] = useState(admin.title_id ?? '');
  const [busy, setBusy] = useState(false);

  const name = `${admin.first_name} ${admin.last_name}`.trim();
  // assertCanManageTarget: changing a super_admin or chairman needs system.assign_board_roles.
  const canChange =
    hasPermission(PERMISSIONS.SYSTEM_ASSIGN_ROLES) && hasPermission(permissionToManage(admin.role_name));
  if (!canChange) return null;
  const canRemove = admin.role_name !== 'super_admin';

  const role = roles?.find((r) => r.id === roleId);
  const hasResidentLink = Boolean(admin.resident_id);
  const blocked = residentRoleBlock(role, hasResidentLink);
  const unchanged = roleId === admin.role_id && titleId === (admin.title_id ?? '');
  const choices = grantableRoles(roles, hasPermission);
  const rolesNotice = roleListNotice({ isLoading: rolesLoading, error: rolesError, count: choices.length });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['current-admins'] });
    queryClient.invalidateQueries({ queryKey: ['admin-titles'] });
    queryClient.invalidateQueries({ queryKey: ['roles'] });
    queryClient.invalidateQueries({ queryKey: ['assignable-roles'] });
    queryClient.invalidateQueries({ queryKey: ['pending-accounts'] });
    queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
  };

  const openChange = () => {
    setRoleId(admin.role_id);
    setTitleId(admin.title_id ?? '');
    setChangeOpen(true);
  };

  const handleRoleChange = (next: string) => {
    setRoleId(next);
    // A title belongs to one role: keep it only when returning to the current role.
    setTitleId(next === admin.role_id ? admin.title_id ?? '' : '');
  };

  const confirmChange = async () => {
    setBusy(true);
    try {
      const result = await assignRoleToProfile(admin.profile_id, roleId, titleId || null);
      if (!result.success) {
        toast.error(result.error ?? 'Failed to change role');
        return;
      }
      toast.success(
        `${name} is now ${roleWithTitle(result.data?.role_display_name, result.data?.title_name)}`
      );
      refresh();
      setChangeOpen(false);
    } catch {
      toast.error('Failed to change role');
    } finally {
      setBusy(false);
    }
  };

  const confirmRemove = async () => {
    setBusy(true);
    try {
      const result = await removeRoleFromProfile(admin.profile_id);
      if (!result.success) {
        toast.error(result.error ?? 'Failed to remove role');
        return;
      }
      toast.success(`Role removed from ${name}`);
      refresh();
      setRemoveOpen(false);
    } catch {
      toast.error('Failed to remove role');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={openChange}
          aria-label={`Change role for ${name}`}
          className="min-h-11 gap-1.5 md:min-h-8"
        >
          <Pencil className="h-4 w-4" />
          Change role
        </Button>
        {canRemove && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRemoveOpen(true)}
            aria-label={`Remove role from ${name}`}
            className="min-h-11 gap-1.5 text-destructive hover:text-destructive md:min-h-8"
          >
            <UserMinus className="h-4 w-4" />
            Remove role
          </Button>
        )}
      </div>

      <Dialog open={changeOpen} onOpenChange={setChangeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change role</DialogTitle>
            <DialogDescription>
              {name} is {roleWithTitle(admin.role_display_name, admin.title_name)}. Choose the role and
              title they should hold instead.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="change-role-select">
                Role
              </label>
              {rolesNotice ?? (
                <Select value={roleId} onValueChange={handleRoleChange} disabled={busy}>
                  <SelectTrigger id="change-role-select" aria-label="Role">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {choices.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <RoleTitlePicker
              role={role}
              titles={titles ?? []}
              titleId={titleId}
              onTitleChange={setTitleId}
              profileId={admin.profile_id}
              hasResidentLink={hasResidentLink}
              disabled={busy}
              titlesLoading={titlesLoading}
              titlesError={titlesError ? titlesError.message : null}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangeOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              onClick={confirmChange}
              disabled={busy || unchanged || Boolean(blocked) || Boolean(rolesNotice) || !role}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove role</AlertDialogTitle>
            <AlertDialogDescription>
              Remove the <strong>{roleWithTitle(admin.role_display_name, admin.title_name)}</strong> role from{' '}
              <strong>{name}</strong>?{' '}
              {hasResidentLink
                ? 'They keep portal access as a resident, but lose every administrative permission.'
                : 'This account is not linked to a resident record, so it returns to pending and loses access until it is approved again.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmRemove();
              }}
              disabled={busy}
              className="bg-destructive hover:bg-destructive/90"
            >
              {busy ? 'Removing...' : 'Remove role'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
