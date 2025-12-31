'use client';

import { memo } from 'react';
import { Badge } from '@/components/ui/badge';
import type { AccountStatus, VerificationStatus, ResidentRole, EntityType } from '@/types/database';
import { RESIDENT_ROLE_LABELS, ENTITY_TYPE_LABELS } from '@/types/database';

// Static variant configs (defined outside components to avoid recreation)
const ACCOUNT_STATUS_VARIANTS: Record<AccountStatus, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
  active: { variant: 'default', label: 'Active' },
  inactive: { variant: 'secondary', label: 'Inactive' },
  suspended: { variant: 'destructive', label: 'Suspended' },
  archived: { variant: 'outline', label: 'Archived' },
};

const VERIFICATION_STATUS_VARIANTS: Record<VerificationStatus, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
  pending: { variant: 'outline', label: 'Pending' },
  submitted: { variant: 'secondary', label: 'Submitted' },
  verified: { variant: 'default', label: 'Verified' },
  rejected: { variant: 'destructive', label: 'Rejected' },
};

const RESIDENT_ROLE_VARIANTS: Record<ResidentRole, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  resident_landlord: 'default',
  non_resident_landlord: 'default',
  tenant: 'secondary',
  developer: 'default',
  co_resident: 'outline',
  household_member: 'outline',
  domestic_staff: 'outline',
  caretaker: 'outline',
  contractor: 'secondary',
};

const ENTITY_TYPE_VARIANTS: Record<EntityType, 'default' | 'secondary' | 'outline'> = {
  individual: 'outline',
  corporate: 'secondary',
};

interface AccountStatusBadgeProps {
  status: AccountStatus;
}

// Memoized badges prevent re-renders when parent updates but badge props are unchanged
// This is especially impactful for tables with many rows
export const AccountStatusBadge = memo(function AccountStatusBadge({ status }: AccountStatusBadgeProps) {
  const { variant, label } = ACCOUNT_STATUS_VARIANTS[status];
  return <Badge variant={variant}>{label}</Badge>;
});

interface VerificationStatusBadgeProps {
  status: VerificationStatus;
}

export const VerificationStatusBadge = memo(function VerificationStatusBadge({ status }: VerificationStatusBadgeProps) {
  const { variant, label } = VERIFICATION_STATUS_VARIANTS[status];
  return <Badge variant={variant}>{label}</Badge>;
});

interface OccupancyBadgeProps {
  isOccupied: boolean;
}

export const OccupancyBadge = memo(function OccupancyBadge({ isOccupied }: OccupancyBadgeProps) {
  return (
    <Badge variant={isOccupied ? 'default' : 'outline'}>
      {isOccupied ? 'Occupied' : 'Vacant'}
    </Badge>
  );
});

interface ResidentRoleBadgeProps {
  role: ResidentRole;
}

export const ResidentRoleBadge = memo(function ResidentRoleBadge({ role }: ResidentRoleBadgeProps) {
  // Handle unknown/legacy role values gracefully
  const variant = RESIDENT_ROLE_VARIANTS[role] ?? 'destructive';
  const label = RESIDENT_ROLE_LABELS[role] ?? role ?? 'Unknown';

  return (
    <Badge variant={variant}>
      {label}
    </Badge>
  );
});

interface EntityTypeBadgeProps {
  entityType: EntityType;
}

export const EntityTypeBadge = memo(function EntityTypeBadge({ entityType }: EntityTypeBadgeProps) {
  return (
    <Badge variant={ENTITY_TYPE_VARIANTS[entityType]}>
      {ENTITY_TYPE_LABELS[entityType]}
    </Badge>
  );
});
