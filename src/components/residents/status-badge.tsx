'use client';

import { Badge } from '@/components/ui/badge';
import type { AccountStatus, VerificationStatus, ResidentRole, EntityType } from '@/types/database';
import { RESIDENT_ROLE_LABELS, ENTITY_TYPE_LABELS } from '@/types/database';

interface AccountStatusBadgeProps {
  status: AccountStatus;
}

export function AccountStatusBadge({ status }: AccountStatusBadgeProps) {
  const variants: Record<AccountStatus, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
    active: { variant: 'default', label: 'Active' },
    inactive: { variant: 'secondary', label: 'Inactive' },
    suspended: { variant: 'destructive', label: 'Suspended' },
    archived: { variant: 'outline', label: 'Archived' },
  };

  const { variant, label } = variants[status];

  return <Badge variant={variant}>{label}</Badge>;
}

interface VerificationStatusBadgeProps {
  status: VerificationStatus;
}

export function VerificationStatusBadge({ status }: VerificationStatusBadgeProps) {
  const variants: Record<VerificationStatus, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
    pending: { variant: 'outline', label: 'Pending' },
    submitted: { variant: 'secondary', label: 'Submitted' },
    verified: { variant: 'default', label: 'Verified' },
    rejected: { variant: 'destructive', label: 'Rejected' },
  };

  const { variant, label } = variants[status];

  return <Badge variant={variant}>{label}</Badge>;
}

interface OccupancyBadgeProps {
  isOccupied: boolean;
}

export function OccupancyBadge({ isOccupied }: OccupancyBadgeProps) {
  return (
    <Badge variant={isOccupied ? 'default' : 'outline'}>
      {isOccupied ? 'Occupied' : 'Vacant'}
    </Badge>
  );
}

interface ResidentRoleBadgeProps {
  role: ResidentRole;
}

export function ResidentRoleBadge({ role }: ResidentRoleBadgeProps) {
  // Color coding by role type (updated for new role names)
  const roleVariants: Record<ResidentRole, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    resident_landlord: 'default',
    non_resident_landlord: 'default',
    tenant: 'secondary',
    developer: 'default',
    co_resident: 'outline',
    household_member: 'outline',
    domestic_staff: 'outline',
    caretaker: 'outline',
  };

  // Handle unknown/legacy role values gracefully
  const variant = roleVariants[role] ?? 'destructive';
  const label = RESIDENT_ROLE_LABELS[role] ?? role ?? 'Unknown';

  return (
    <Badge variant={variant}>
      {label}
    </Badge>
  );
}

interface EntityTypeBadgeProps {
  entityType: EntityType;
}

export function EntityTypeBadge({ entityType }: EntityTypeBadgeProps) {
  const variants: Record<EntityType, 'default' | 'secondary' | 'outline'> = {
    individual: 'outline',
    corporate: 'secondary',
  };

  return (
    <Badge variant={variants[entityType]}>
      {ENTITY_TYPE_LABELS[entityType]}
    </Badge>
  );
}
