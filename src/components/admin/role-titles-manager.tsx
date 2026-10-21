'use client';

import { useState } from 'react';
import { Loader2, Pencil, Plus, Users } from 'lucide-react';
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
  useAdminTitles,
  useCreateAdminTitle,
  useRolesWithPermissions,
  useUpdateAdminTitle,
} from '@/hooks/use-roles';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { SettingsSkeleton } from '@/components/settings/settings-states';
import type { AdminTitleWithHolders, AppRoleWithPermissions } from '@/types/database';

type Editing =
  | { mode: 'create'; role: AppRoleWithPermissions }
  | { mode: 'edit'; role: AppRoleWithPermissions; title: AdminTitleWithHolders };

/** "" means unlimited; anything else must be a whole number of at least 1. */
function parseSeats(raw: string): { ok: true; seats: number | null } | { ok: false } {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: true, seats: null };
  const seats = Number(trimmed);
  return Number.isInteger(seats) && seats >= 1 ? { ok: true, seats } : { ok: false };
}

/**
 * Add, rename and resize the titles under each role (#827). The buttons need
 * system.manage_roles, the same permission the title actions enforce.
 */
export function RoleTitlesManager() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.SYSTEM_MANAGE_ROLES);
  const { data: roles, isLoading: rolesLoading } = useRolesWithPermissions();
  const { data: titles, isLoading: titlesLoading } = useAdminTitles();
  const createTitle = useCreateAdminTitle();
  const updateTitle = useUpdateAdminTitle();

  const [editing, setEditing] = useState<Editing | null>(null);
  const [name, setName] = useState('');
  const [seats, setSeats] = useState('');

  if (rolesLoading || titlesLoading) return <SettingsSkeleton rows={3} />;

  const open = (next: Editing) => {
    setEditing(next);
    setName(next.mode === 'edit' ? next.title.name : '');
    setSeats(next.mode === 'edit' && next.title.seats !== null ? String(next.title.seats) : '');
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
        await updateTitle.mutateAsync({ id: editing.title.id, input });
      }
      setEditing(null);
    } catch {
      // The hook's onError already showed the reason; keep the dialog open.
    }
  };

  const rolesWithTitles = (roles ?? [])
    .filter((role) => role.is_active && role.category !== 'resident')
    .map((role) => ({ role, titles: (titles ?? []).filter((t) => t.role_id === role.id) }));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        A title says what a person is called under a role, such as Vice Chairman under Chairman. Seats
        limit how many people can hold a title at once; leave seats empty for no limit.
      </p>
      <ul className="space-y-3">
        {rolesWithTitles.map(({ role, titles: roleTitles }) => (
          <li key={role.id} className="rounded-md border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{role.display_name}</span>
              {canManage && (
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
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-11 md:size-8"
                        onClick={() => open({ mode: 'edit', role, title })}
                        aria-label={`Edit title ${title.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
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
                <p className="text-sm text-destructive">Seats must be a whole number of 1 or more.</p>
              )}
            </div>
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
    </div>
  );
}
