'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AccountStatusBadge, ResidentRoleBadge } from '@/components/residents/status-badge';
import { ArrowRightLeft, ArrowUp, DoorOpen, MoreHorizontal, SquarePen, Trash2, UserMinus, type LucideIcon } from 'lucide-react';
import type { ResidentRole } from '@/types/database';
import type { ActiveResidentHouse } from '@/components/houses/residents-tab';

export type ResidentAction =
  | 'owner-move-out'
  | 'tenant-move-out'
  | 'transfer'
  | 'edit'
  | 'promote'
  | 'remove'
  | 'remove-ownership';

const SECONDARY_ROLES: ResidentRole[] = ['co_resident', 'household_member', 'domestic_staff', 'caretaker'];
const OWNER_ROLES: ResidentRole[] = ['non_resident_landlord', 'developer'];

interface ActionSpec {
  action: ResidentAction;
  label: string;
  icon: LucideIcon;
  destructive?: boolean;
  testId?: string;
}

interface ResidentRowProps {
  rh: ActiveResidentHouse;
  canAssignResident: boolean;
  canUpdateHouse: boolean;
  /** A tenant or owner-occupier lives here, so an Occupant can be promoted by swapping with them. */
  canPromote: boolean;
  onAction: (action: ResidentAction, rh: ActiveResidentHouse) => void;
}

/** The actions a row offers, in priority order. Gates mirror the server actions' permissions. */
export function residentActions(
  role: ResidentRole,
  { canAssignResident, canUpdateHouse, canPromote }: Pick<ResidentRowProps, 'canAssignResident' | 'canUpdateHouse' | 'canPromote'>
): ActionSpec[] {
  const actions: ActionSpec[] = [];
  if (canAssignResident && role === 'resident_landlord') actions.push({ action: 'owner-move-out', label: 'Move Out', icon: DoorOpen });
  if (canAssignResident && role === 'tenant') actions.push({ action: 'tenant-move-out', label: 'Move Out', icon: DoorOpen });
  if (canUpdateHouse && OWNER_ROLES.includes(role)) actions.push({ action: 'transfer', label: 'Transfer', icon: ArrowRightLeft });
  if (canAssignResident && SECONDARY_ROLES.includes(role)) actions.push({ action: 'edit', label: 'Edit role', icon: SquarePen });
  if (canAssignResident && canPromote && role === 'co_resident') {
    actions.push({ action: 'promote', label: 'Promote to primary role', icon: ArrowUp });
  }
  if (canAssignResident && SECONDARY_ROLES.includes(role)) {
    actions.push({ action: 'remove', label: 'Remove from house', icon: Trash2, destructive: true, testId: 'remove-resident-button' });
  }
  // Remove ownership is enforced by houses.assign_resident server-side, unlike Transfer (houses.update).
  if (canAssignResident && OWNER_ROLES.includes(role)) {
    actions.push({ action: 'remove-ownership', label: 'Remove', icon: UserMinus, destructive: true });
  }
  return actions;
}

const targetClass = 'min-h-11 md:min-h-0 md:h-8';

/** One resident: name and badges, one primary action button, the rest in a "…" menu (#784). */
export function ResidentRow({ rh, onAction, ...gates }: ResidentRowProps) {
  const role = rh.resident_role as ResidentRole;
  const residentName = `${rh.resident.first_name} ${rh.resident.last_name}`;
  const [primary, ...rest] = residentActions(role, gates);

  return (
    <div
      className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
      data-testid="resident-card"
    >
      <div className="min-w-0">
        <Link href={`/residents/${rh.resident.id}`} className="font-medium break-words hover:underline">
          {residentName}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <ResidentRoleBadge role={role} />
          <AccountStatusBadge status={rh.resident.account_status} />
        </div>
      </div>
      {primary && (
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className={`${targetClass} ${primary.destructive ? 'text-destructive hover:text-destructive' : ''}`}
            onClick={() => onAction(primary.action, rh)}
            data-testid={primary.testId}
            aria-label={primary.testId ? `Remove ${residentName} from house` : undefined}
          >
            <primary.icon className="h-4 w-4 mr-1" />
            {primary.label}
          </Button>
          {rest.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-11 md:size-8" aria-label={`More actions for ${residentName}`}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {rest.map((item) => (
                  <DropdownMenuItem
                    key={item.action}
                    variant={item.destructive ? 'destructive' : 'default'}
                    onSelect={() => onAction(item.action, rh)}
                    data-testid={item.testId}
                    aria-label={item.testId ? `Remove ${residentName} from house` : undefined}
                  >
                    <item.icon className="mr-2 h-4 w-4" />
                    {item.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
    </div>
  );
}
