'use client';

import { AlertTriangle } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { permissionToGrant } from '@/lib/auth/board-roles';
import type { AdminTitleWithHolders } from '@/types/database';

/** Value for "no title" in a Select, which cannot hold an empty string item. */
const NO_TITLE = '__none__';

/**
 * The fields of a role these helpers read. Both AppRoleWithPermissions (Roles
 * tab) and AssignableRole (the assignment dialogs, #1316) satisfy it.
 */
export type PickerRole = {
  id: string;
  name: string;
  display_name: string;
  is_active: boolean;
  requires_resident?: boolean;
};

/**
 * Roles the signed-in administrator may grant. Mirrors assertCanGrantRoles in
 * the assign actions, which is the enforcement; this only avoids offering a
 * choice the server would refuse.
 */
export function grantableRoles<R extends PickerRole>(
  roles: R[] | undefined,
  hasPermission: (permission: string) => boolean
): R[] {
  return (roles ?? []).filter(
    (role) => role.is_active && hasPermission(permissionToGrant(role.name))
  );
}

/** Other people holding the title, as the seat check counts them. */
export function otherHolders(title: AdminTitleWithHolders, profileId: string | null) {
  return title.holders.filter((h) => h.profile_id !== profileId);
}

export function isTitleFull(title: AdminTitleWithHolders, profileId: string | null): boolean {
  return title.seats !== null && otherHolders(title, profileId).length >= title.seats;
}

/** Why a resident-only role cannot go to this account, or null when it can. */
export function residentRoleBlock(
  role: PickerRole | undefined,
  hasResidentLink: boolean
): string | null {
  if (!role?.requires_resident || hasResidentLink) return null;
  return `The ${role.display_name} role can only be held by a resident. This account is not linked to a resident record, so link it first.`;
}

/**
 * What to show instead of a role list that cannot offer anything: the load
 * error with the server's reason, a loading line, or "No roles you can give".
 * Null when there are roles to choose from. Never an empty select (CORE.md §6).
 */
export function roleListNotice({
  isLoading,
  error,
  count,
}: {
  isLoading: boolean;
  error: unknown;
  count: number;
}) {
  if (error) {
    const reason = error instanceof Error && error.message ? error.message : 'Unknown error';
    return (
      <p role="alert" className="text-sm text-destructive">
        Could not load the roles: {reason}
      </p>
    );
  }
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading roles...</p>;
  if (count === 0) return <p className="text-sm text-muted-foreground">No roles you can give</p>;
  return null;
}

export function RoleTitlePicker({
  role,
  titles,
  titleId,
  onTitleChange,
  profileId,
  hasResidentLink,
  disabled,
  titlesLoading,
  titlesError,
}: {
  role: PickerRole | undefined;
  titles: AdminTitleWithHolders[];
  titleId: string;
  onTitleChange: (titleId: string) => void;
  /** The account being edited, so its own seat never counts as taken. */
  profileId: string | null;
  hasResidentLink: boolean;
  disabled?: boolean;
  titlesLoading?: boolean;
  /** Why the titles could not be loaded; shown instead of an empty list. */
  titlesError?: string | null;
}) {
  const roleTitles = role ? titles.filter((t) => t.role_id === role.id) : [];
  const block = residentRoleBlock(role, hasResidentLink);

  return (
    <div className="space-y-3">
      {block && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-400"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <p>{block}</p>
        </div>
      )}
      {role && (
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="role-title-select">
            Title
          </label>
          {titlesError ? (
            <p role="alert" className="text-sm text-destructive">
              Could not load the titles: {titlesError}
            </p>
          ) : titlesLoading ? (
            <p className="text-sm text-muted-foreground">Loading titles...</p>
          ) : roleTitles.length === 0 ? (
            <p className="text-sm text-muted-foreground">No titles for this role</p>
          ) : (
            <Select
              value={titleId || NO_TITLE}
              onValueChange={(value) => onTitleChange(value === NO_TITLE ? '' : value)}
              disabled={disabled || Boolean(block)}
            >
              <SelectTrigger id="role-title-select" aria-label="Title">
                <SelectValue placeholder="Select a title" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TITLE}>No title</SelectItem>
                {roleTitles.map((title) => {
                  const full = isTitleFull(title, profileId);
                  const holders = otherHolders(title, profileId).map((h) => h.name).join(', ');
                  return (
                    <SelectItem key={title.id} value={title.id} disabled={full}>
                      {title.name}
                      {full && ` — held by ${holders}`}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          )}
        </div>
      )}
    </div>
  );
}
