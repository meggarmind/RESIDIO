'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { ResidentSummary } from '@/actions/houses/get-house-residents';

interface ResidentAvatarClusterProps {
  residents: ResidentSummary[];
  maxDisplay?: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'size-6 text-[10px]',
  md: 'size-8 text-xs',
  lg: 'size-10 text-sm',
};

const overlapClasses = {
  sm: '-ml-2',
  md: '-ml-2.5',
  lg: '-ml-3',
};

/**
 * Get initials from a resident name
 */
function getInitials(resident: ResidentSummary): string {
  if (resident.entity_type === 'corporate' && resident.company_name) {
    // For corporate entities, use first 2 letters of company name
    return resident.company_name.substring(0, 2).toUpperCase();
  }
  // For individuals, use first letter of first and last name
  const first = resident.first_name?.charAt(0) || '';
  const last = resident.last_name?.charAt(0) || '';
  return (first + last).toUpperCase() || '??';
}

/**
 * Get display name for a resident
 */
function getDisplayName(resident: ResidentSummary): string {
  if (resident.entity_type === 'corporate' && resident.company_name) {
    return resident.company_name;
  }
  return `${resident.first_name} ${resident.last_name}`.trim();
}

/**
 * Get a consistent color based on resident ID
 */
function getAvatarColor(residentId: string): string {
  const colors = [
    'bg-blue-500',
    'bg-emerald-500',
    'bg-amber-500',
    'bg-purple-500',
    'bg-rose-500',
    'bg-cyan-500',
    'bg-indigo-500',
    'bg-teal-500',
  ];
  // Simple hash based on first few characters of ID
  const hash = residentId.charCodeAt(0) + (residentId.charCodeAt(1) || 0);
  return colors[hash % colors.length];
}

export function ResidentAvatarCluster({
  residents,
  maxDisplay = 4,
  size = 'md',
  className,
}: ResidentAvatarClusterProps) {
  if (!residents || residents.length === 0) {
    return null;
  }

  const displayResidents = residents.slice(0, maxDisplay);
  const overflowCount = residents.length - maxDisplay;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn('flex items-center', className)}>
          {displayResidents.map((resident, index) => (
            <Avatar
              key={resident.id}
              className={cn(
                sizeClasses[size],
                index > 0 && overlapClasses[size],
                'ring-2 ring-background'
              )}
            >
              <AvatarFallback
                className={cn(
                  getAvatarColor(resident.id),
                  'text-white font-medium'
                )}
              >
                {getInitials(resident)}
              </AvatarFallback>
            </Avatar>
          ))}
          {overflowCount > 0 && (
            <Avatar
              className={cn(
                sizeClasses[size],
                overlapClasses[size],
                'ring-2 ring-background'
              )}
            >
              <AvatarFallback className="bg-muted text-muted-foreground font-medium">
                +{overflowCount}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[200px]">
        <div className="flex flex-col gap-0.5">
          {residents.map((resident) => (
            <span key={resident.id} className="truncate">
              {getDisplayName(resident)}
              {resident.is_primary && (
                <span className="text-muted-foreground ml-1">(Primary)</span>
              )}
            </span>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export { getInitials, getDisplayName, getAvatarColor };
