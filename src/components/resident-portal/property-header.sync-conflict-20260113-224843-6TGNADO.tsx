'use client';

import { ArrowLeft, Home, MapPin, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { HouseWithStreet, ResidentRole } from '@/types/database';

// Role labels for display
const roleLabels: Record<ResidentRole, string> = {
  resident_landlord: 'Landlord',
  non_resident_landlord: 'Non-Resident Landlord',
  tenant: 'Tenant',
  developer: 'Developer',
  co_resident: 'Co-Resident',
  household_member: 'Household Member',
  domestic_staff: 'Domestic Staff',
  caretaker: 'Caretaker',
  contractor: 'Contractor',
};

// Role colors for badges
const roleColors: Record<string, string> = {
  resident_landlord: 'bg-blue-500/10 text-blue-700 border-blue-200 dark:text-blue-400 dark:border-blue-800',
  non_resident_landlord: 'bg-purple-500/10 text-purple-700 border-purple-200 dark:text-purple-400 dark:border-purple-800',
  tenant: 'bg-green-500/10 text-green-700 border-green-200 dark:text-green-400 dark:border-green-800',
  household_member: 'bg-gray-500/10 text-gray-700 border-gray-200 dark:text-gray-400 dark:border-gray-700',
  domestic_staff: 'bg-teal-500/10 text-teal-700 border-teal-200 dark:text-teal-400 dark:border-teal-800',
  contractor: 'bg-amber-500/10 text-amber-700 border-amber-200 dark:text-amber-400 dark:border-amber-800',
  caretaker: 'bg-indigo-500/10 text-indigo-700 border-indigo-200 dark:text-indigo-400 dark:border-indigo-800',
  co_resident: 'bg-cyan-500/10 text-cyan-700 border-cyan-200 dark:text-cyan-400 dark:border-cyan-800',
  developer: 'bg-rose-500/10 text-rose-700 border-rose-200 dark:text-rose-400 dark:border-rose-800',
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
          isOccupied ? 'bg-emerald-500/20' : 'bg-amber-500/20'
        )}>
          <Home className={cn(
            'h-6 w-6',
            isOccupied ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
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
              <Badge className="text-xs bg-blue-500 text-white border-0">
                Primary
              </Badge>
            )}

            {/* Occupancy Badge */}
            <Badge
              variant="outline"
              className={cn(
                'text-xs',
                isOccupied
                  ? 'bg-emerald-500/10 text-emerald-700 border-emerald-200 dark:text-emerald-400 dark:border-emerald-800'
                  : 'bg-amber-500/10 text-amber-700 border-amber-200 dark:text-amber-400 dark:border-amber-800'
              )}
            >
              <span className={cn(
                'h-1.5 w-1.5 rounded-full mr-1.5',
                isOccupied ? 'bg-emerald-500' : 'bg-amber-500'
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
