'use client';

import { Badge } from '@/components/ui/badge';
import type { AccountStatus, VerificationStatus } from '@/types/database';

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
