'use client';

import { useState } from 'react';
import { Loader2, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import {
  useAdminTitles,
  useCreateAdminTitle,
  useDeleteAdminTitle,
  useRolesWithPermissions,
  useUpdateAdminTitle,
} from '@/hooks/use-roles';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { titleWriteBlock } from '@/lib/auth/role-write-access';
import { SettingsSkeleton } from '@/components/settings/settings-states';
import type { AdminTitleWithHolders, AppRoleWithPermissions } from '@/types/database';

type Editing =
  | { mode: 'create'; role: AppRoleWithPermissions }
  | { mode: 'edit'; role: AppRoleWithPermissions; title: AdminTitleWithHolders };

/** "" means unlimited; anything else must be a whole number from 1 to 99. */
export function parseSeats(raw: string): { ok: true; seats: number | null } | { ok: false } {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: true, seats: null };
  if (!/^\d{1,2}$/.test(trimmed)) return { ok: false };
  const seats = Number(trimmed);
  return seats >= 1 && seats <= 99 ? { ok: true, seats } : { ok: false };
}

/**
 * Add, rename, resize, move and delete the titles under each role (#827, #1318).
 * Each button shows only where the title actions would allow it: system.manage_roles,
 * and every role except super_admin (titleWriteBlock, #1361). A role whose buttons
 * are hidden says why.
 */
export function RoleTitlesManager() {
  const { hasPermission, profile } = useAuth();
  const canManage = hasPermission(PERMISSIONS.SYSTEM_MANAGE_ROLES);
  const caller = { roleName: profile?.role_name ?? null, roleId: profile?.role_id ?? null };
  const canWriteTitlesOf = (role: AppRoleWithPermissions) =>
    canManage && titleWriteBlock(caller, role) === null;

  const { data: roles, isLoading: rolesLoading, error: rolesError } = useRolesWithPermissions();
  const { data: titles, isLoading: titlesLoading, error: titlesError } = useAdminTitles();
  const createTitle = useCreateAdminTitle();
  const updateTitle = useUpdateAdminTitle();
  const deleteTitle = useDeleteAdminTitle();

  const [editing, setEditing] = useState<Editing | null>(null);
  const [name, setName] = useState('');
  const [seats, setSeats] = useState('');
  const [roleId, setRoleId] = useState('');
  const [toDelete, setToDelete] = useState<AdminTitleWithHolders | null>(null);

  if (rolesLoading || titlesLoading) return <SettingsSkeleton rows={3} />;

  const loadError = rolesError ?? titlesError;
  if (loadError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Could not load titles: {loadError.message}
      </p>
    );
  }

  const open = (next: Editing) => {
    setEditing(next);
    setName(next.mode === 'edit' ? next.title.name : '');
    setSeats(next.mode === 'edit' && next.title.seats !== null ? String(next.title.seats) : '');
    setRoleId(next.role.id);
  };

  const parsedSeats = parseSeats(seats);
  const pending = createTitle.isPending || updateTitle.isPending;
  const canSave = name.trim().length > 0 && parsedSeats.ok && !pending;

  const save = async () => {
    if (!editing || !parsedSeats.ok) return;
    const input = { name: name.trim(), seats: parsedSeats.seats };
    try {
      if (editing.mode === 'create') {
        await createTitle.mutateAsync({ role_id: editing.role.id, ...input });
      } else {
        await updateTitle.mutateAsync({
          id: editing.title.id,
          input: roleId !== editing.role.id ? { ...input, role_id: roleId } : input,
        });
      }
      setEditing(null);
    } catch {
      // The hook's onError already showed the reason; keep the dialog open.
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteTitle.mutateAsync(toDelete.id);
      setToDelete(null);
    } catch {
      // The hook's onError already showed the reason; keep the dialog open.
    }
  };

  // Inactive roles are listed too, so their titles can still be edited (#1318).
  const rolesWithTitles = (roles ?? [])
    .filter((role) => role.category !== 'resident')
    .map((role) => ({ role, titles: (titles ?? []).filter((t) => t.role_id === role.id) }));

  // A title can move only to a role whose titles the caller may change.
  const moveTargets = rolesWithTitles.map(({ role }) => role).filter(canWriteTitlesOf);
  // Why the role cannot change, or null when it can (the server refuses the same cases).
  const moveBlock =
    editing?.mode === 'edit'
      ? editing.title.is_principal
        ? 'A principal title stays with its role.'
        : editing.title.holders.length > 0
          ? 'Remove this title from the people holding it before moving it to another role.'
          : null
      : null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        A title says what a person is called under a role, such as Vice Chairman under Chairman. Seats
        limit how many people can hold a title at once; leave seats empty for no limit.
      </p>
      <ul className="space-y-3">
        {rolesWithTitles.map(({ role, titles: roleTitles }) => {
          const writable = canWriteTitlesOf(role);
          return (
            <li key={role.id} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{role.display_name}</span>
                  {!role.is_active && <Badge variant="outline">Inactive</Badge>}
                </div>
                {writable && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-11 gap-1.5 md:min-h-8"
                    onClick={() => open({ mode: 'create', role })}
                    aria-label={`Add title to ${role.display_name}`}
                  >
                    <Plus className="h-4 w-4" />
                    Add title
                  </Button>
                )}
              </div>
              {canManage && !writable && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Only Super Administrator can change these titles.
                </p>
              )}
              {roleTitles.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No titles.</p>
              ) : (
                <ul className="mt-2 divide-y">
                  {roleTitles.map((title) => (
                    <li key={title.id} className="flex flex-wrap items-center gap-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{title.name}</span>
                          {title.is_principal && <Badge variant="secondary">Principal</Badge>}
                        </div>
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Users className="h-3 w-3" />
                          {title.holders.length} of {title.seats ?? 'unlimited'} seats
                          {title.holders.length > 0 && ` · ${title.holders.map((h) => h.name).join(', ')}`}
                        </p>
                      </div>
                      {writable && (
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-11 md:size-8"
                            onClick={() => open({ mode: 'edit', role, title })}
                            aria-label={`Edit title ${title.name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {/* The server refuses a principal title or one someone holds. */}
                          {!title.is_principal && title.holders.length === 0 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-11 text-destructive hover:text-destructive md:size-8"
                              onClick={() => setToDelete(title)}
                              aria-label={`Delete title ${title.name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <Dialog open={editing !== null} onOpenChange={(isOpen) => !isOpen && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.mode === 'edit' ? 'Edit title' : 'Add title'}</DialogTitle>
            <DialogDescription>Under {editing?.role.display_name}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title-name">Title name</Label>
              <Input
                id="title-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="title-seats">Seats</Label>
              <Input
                id="title-seats"
                inputMode="numeric"
                placeholder="Unlimited"
                value={seats}
                onChange={(e) => setSeats(e.target.value)}
                aria-invalid={!parsedSeats.ok}
              />
              {!parsedSeats.ok && (
                <p className="text-sm text-destructive">
                  Seats must be a whole number from 1 to 99, or empty for no limit.
                </p>
              )}
            </div>
            {editing?.mode === 'edit' && (
              <div className="space-y-2">
                <Label htmlFor="title-role">Role</Label>
                <Select value={roleId} onValueChange={setRoleId} disabled={moveBlock !== null}>
                  <SelectTrigger id="title-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {moveTargets.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.display_name}
                        {role.is_active ? '' : ' (inactive)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {moveBlock && <p className="text-sm text-muted-foreground">{moveBlock}</p>}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={save} disabled={!canSave}>
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={toDelete !== null} onOpenChange={(isOpen) => !isOpen && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete title</AlertDialogTitle>
            <AlertDialogDescription>
              Delete the title &quot;{toDelete?.name}&quot;? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteTitle.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // Stay open until the delete succeeds, so a refusal is read in context.
                e.preventDefault();
                void confirmDelete();
              }}
              disabled={deleteTitle.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteTitle.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
