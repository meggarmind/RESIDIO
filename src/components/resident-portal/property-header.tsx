'use client';

import { ArrowLeft, Home, MapPin, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { HouseWithStreet, ResidentRole } from '@/types/database';

// Role labels for display (synced with RESIDENT_ROLE_LABELS in database.ts)
const roleLabels: Record<ResidentRole, string> = {
  resident_landlord: 'Owner-Occupier',
  non_resident_landlord: 'Property Owner',
  tenant: 'Renter',
  developer: 'Developer',
  co_resident: 'Occupant',
  household_member: 'Family Member',
  domestic_staff: 'Domestic Staff',
  caretaker: 'Caretaker',
  contractor: 'Contractor',
};

// Role colors for badges (modern theme compliant)
const roleColors: Record<string, string> = {
  resident_landlord: 'bg-primary/10 text-primary border-primary/20',
  non_resident_landlord: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
  tenant: 'bg-success/10 text-success border-success/20',
  household_member: 'bg-muted text-muted-foreground border-border',
  domestic_staff: 'bg-teal-500/10 text-teal-500 border-teal-500/20',
  contractor: 'bg-warning/10 text-warning border-warning/20',
  caretaker: 'bg-sky-500/10 text-sky-500 border-sky-500/20',
  co_resident: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
  developer: 'bg-destructive/10 text-destructive border-destructive/20',
};

interface PropertyHeaderProps {
  house: HouseWithStreet;
  residentRole: ResidentRole;
  residentCount: number;
  isPrimary?: boolean;
  className?: string;
}

export function PropertyHeader({
  house,
  residentRole,
  residentCount,
  isPrimary = false,
  className,
}: PropertyHeaderProps) {
  const router = useRouter();
  const isOccupied = residentCount > 0;
  const address = `${house.house_number}, ${house.street.name}`;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Back Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push('/portal')}
        className="gap-2 -ml-2 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Dashboard
      </Button>

      {/* Property Info */}
      <div className="flex items-start gap-4">
        <div className={cn(
          'p-3 rounded-xl',
          isOccupied ? 'bg-success/10' : 'bg-warning/10'
        )}>
          <Home className={cn(
            'h-6 w-6',
            isOccupied ? 'text-success' : 'text-warning'
          )} />
        </div>
        <div className="flex-1 min-w-0">
          {/* Address */}
          <h1 className="text-2xl font-bold tracking-tight truncate">
            {address}
          </h1>

          {/* Street & House Type */}
          <div className="flex items-center gap-2 text-muted-foreground mt-1">
            <MapPin className="h-3.5 w-3.5" />
            <span className="text-sm">
              {house.street.name}
              {house.house_type && ` • ${house.house_type.name}`}
            </span>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {/* Your Role Badge */}
            <Badge
              variant="outline"
              className={cn('text-xs', roleColors[residentRole])}
            >
              {roleLabels[residentRole] || residentRole}
            </Badge>

            {/* Primary Badge */}
            {isPrimary && (
              <Badge className="text-xs bg-primary text-primary-foreground border-0 shadow-sm">
                Primary
              </Badge>
            )}

            {/* Occupancy Badge */}
            <Badge
              variant={isOccupied ? 'success' : 'warning'}
              className="text-xs"
            >
              <span className={cn(
                'h-1.5 w-1.5 rounded-full mr-1.5',
                isOccupied ? 'bg-success-foreground' : 'bg-warning-foreground'
              )} />
              {isOccupied ? 'Occupied' : 'Vacant'}
            </Badge>

            {/* Resident Count */}
            {residentCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                <Users className="h-3 w-3 mr-1" />
                {residentCount} resident{residentCount !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
