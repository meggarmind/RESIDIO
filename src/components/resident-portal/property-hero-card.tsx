'use client';

import { Home, MapPin, Users, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn, getPropertyShortname } from '@/lib/utils';
import { ResidentAvatarCluster } from './resident-avatar-cluster';
import type { ResidentSummary } from '@/actions/houses/get-house-residents';
import type { ResidentRole, HouseWithStreet } from '@/types/database';

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

// Role colors for badges (matching profile page)
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

// Gradient backgrounds based on occupancy
const occupancyGradients = {
  occupied: 'bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border-emerald-500/20',
  vacant: 'bg-gradient-to-br from-amber-500/10 to-orange-500/5 border-amber-500/20',
};

interface PropertyHeroCardProps {
  house: HouseWithStreet;
  residentRole: ResidentRole;
  currentResidents: ResidentSummary[];
  isPrimary?: boolean;
  onClick?: () => void;
  className?: string;
}

export function PropertyHeroCard({
  house,
  residentRole,
  currentResidents,
  isPrimary = false,
  onClick,
  className,
}: PropertyHeroCardProps) {
  const isOccupied = currentResidents.length > 0;
  const occupancyGradient = isOccupied ? occupancyGradients.occupied : occupancyGradients.vacant;
  const shortname = getPropertyShortname(house);
  const address = `${house.house_number}, ${house.street.name}`;

  return (
    <Card
      className={cn(
        'relative overflow-hidden cursor-pointer transition-all duration-200',
        'hover:shadow-md hover:-translate-y-0.5',
        'active:translate-y-0 active:shadow-sm',
        occupancyGradient,
        className
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        {/* Primary Badge */}
        {isPrimary && (
          <Badge
            variant="secondary"
            className="absolute top-2 right-2 text-[10px] bg-blue-500 text-white border-0"
          >
            Primary
          </Badge>
        )}

        {/* Property Address */}
        <div className="flex items-start gap-3 mb-3">
          <div className={cn(
            'p-2 rounded-lg',
            isOccupied ? 'bg-emerald-500/20' : 'bg-amber-500/20'
          )}>
            <Home className={cn(
              'h-5 w-5',
              isOccupied ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
            )} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-mono text-sm font-bold bg-muted px-2 py-0.5 rounded">
                {shortname}
              </span>
            </div>
            <h3 className="font-medium text-sm text-muted-foreground leading-tight truncate">
              {address}
            </h3>
            {house.house_type && (
              <p className="text-xs text-muted-foreground/70 truncate">
                {house.house_type.name}
              </p>
            )}
          </div>
        </div>

        {/* Role Badge */}
        <div className="flex items-center gap-2 mb-3">
          <Badge
            variant="outline"
            className={cn('text-xs', roleColors[residentRole])}
          >
            {roleLabels[residentRole] || residentRole}
          </Badge>
        </div>

        {/* Occupancy Status and Residents */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Occupancy Indicator */}
            <div className="flex items-center gap-1.5">
              <span className={cn(
                'h-2 w-2 rounded-full',
                isOccupied ? 'bg-emerald-500' : 'bg-amber-500'
              )} />
              <span className="text-xs text-muted-foreground">
                {isOccupied ? 'Occupied' : 'Vacant'}
              </span>
            </div>

            {/* Resident Count */}
            {currentResidents.length > 0 && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="h-3 w-3" />
                <span>{currentResidents.length}</span>
              </div>
            )}
          </div>

          {/* Resident Avatars */}
          {currentResidents.length > 0 && (
            <ResidentAvatarCluster
              residents={currentResidents}
              maxDisplay={3}
              size="sm"
            />
          )}
        </div>

        {/* View Details Arrow */}
        <div className="absolute bottom-4 right-4 opacity-50 group-hover:opacity-100 transition-opacity">
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}

export { roleLabels, roleColors };
