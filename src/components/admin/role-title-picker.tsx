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
import type { AdminTitleWithHolders, AppRoleWithPermissions } from '@/types/database';

/** Value for "no title" in a Select, which cannot hold an empty string item. */
const NO_TITLE = '__none__';

/**
 * Roles the signed-in administrator may grant. Mirrors assertCanGrantRoles in
 * the assign actions, which is the enforcement; this only avoids offering a
 * choice the server would refuse.
 */
export function grantableRoles(
  roles: AppRoleWithPermissions[] | undefined,
  hasPermission: (permission: string) => boolean
): AppRoleWithPermissions[] {
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
  role: AppRoleWithPermissions | undefined,
  hasResidentLink: boolean
): string | null {
  if (!role?.requires_resident || hasResidentLink) return null;
  return `The ${role.display_name} role can only be held by a resident. This account is not linked to a resident record, so link it first.`;
}

export function RoleTitlePicker({
  role,
  titles,
  titleId,
  onTitleChange,
  profileId,
  hasResidentLink,
  disabled,
}: {
  role: AppRoleWithPermissions | undefined;
  titles: AdminTitleWithHolders[];
  titleId: string;
  onTitleChange: (titleId: string) => void;
  /** The account being edited, so its own seat never counts as taken. */
  profileId: string | null;
  hasResidentLink: boolean;
  disabled?: boolean;
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
      {role && roleTitles.length > 0 && (
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="role-title-select">
            Title
          </label>
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
        </div>
      )}
    </div>
  );
}
