'use client';

import { History, Home, UserPlus, UserMinus, ArrowRightLeft, RefreshCw, Building2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { OwnershipHistoryWithEndDate } from '@/hooks/use-houses';
import type { OwnershipEventType, ResidentRole } from '@/types/database';

// Event type labels
const EVENT_LABELS: Record<OwnershipEventType, string> = {
  house_added: 'Added to Portal',
  ownership_start: 'Ownership Started',
  ownership_transfer: 'Ownership Transferred',
  ownership_end: 'Ownership Ended',
  move_in: 'Moved In',
  move_out: 'Moved Out',
  role_change: 'Role Changed',
};

// Event icons
const EVENT_ICONS: Record<OwnershipEventType, typeof Home> = {
  house_added: Building2,
  ownership_start: Home,
  ownership_transfer: ArrowRightLeft,
  ownership_end: ArrowRightLeft,
  move_in: UserPlus,
  move_out: UserMinus,
  role_change: RefreshCw,
};

// Event colors
const EVENT_COLORS: Record<OwnershipEventType, string> = {
  house_added: 'bg-blue-500/20 text-blue-600 dark:text-blue-400',
  ownership_start: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
  ownership_transfer: 'bg-purple-500/20 text-purple-600 dark:text-purple-400',
  ownership_end: 'bg-amber-500/20 text-amber-600 dark:text-amber-400',
  move_in: 'bg-green-500/20 text-green-600 dark:text-green-400',
  move_out: 'bg-red-500/20 text-red-600 dark:text-red-400',
  role_change: 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400',
};

// Role labels (synced with RESIDENT_ROLE_LABELS in database.ts)
const ROLE_LABELS: Record<ResidentRole, string> = {
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

interface OccupancyHistoryTimelineProps {
  history: OwnershipHistoryWithEndDate[] | null | undefined;
  isLoading?: boolean;
  className?: string;
}

export function OccupancyHistoryTimeline({
  history,
  isLoading = false,
  className,
}: OccupancyHistoryTimelineProps) {
  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" />
            Occupancy History
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-8 w-8 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!history || history.length === 0) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" />
            Occupancy History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <History className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No history records found</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4" />
          Occupancy History
          <Badge variant="secondary" className="ml-auto text-xs">
            {history.length} events
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />

          {/* Timeline events */}
          <div className="space-y-4">
            {history.map((event, index) => (
              <TimelineEvent
                key={event.id}
                event={event}
                isFirst={index === 0}
                isLast={index === history.length - 1}
              />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface TimelineEventProps {
  event: OwnershipHistoryWithEndDate;
  isFirst: boolean;
  isLast: boolean;
}

function TimelineEvent({ event, isFirst }: TimelineEventProps) {
  const eventType = event.event_type as OwnershipEventType;
  const Icon = EVENT_ICONS[eventType] || History;
  const colorClass = EVENT_COLORS[eventType] || 'bg-gray-500/20 text-gray-600';

  // Format resident name
  const residentName = event.resident
    ? event.resident.entity_type === 'corporate' && event.resident.company_name
      ? event.resident.company_name
      : `${event.resident.first_name} ${event.resident.last_name}`
    : null;

  // Format date
  const eventDate = event.event_date
    ? new Date(event.event_date).toLocaleDateString('en-NG', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  // Format end date if available
  const endDate = event.end_date
    ? new Date(event.end_date).toLocaleDateString('en-NG', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  // Get event description
  const description = getEventDescription(event);

  return (
    <div className="relative flex gap-3 pl-1">
      {/* Timeline dot */}
      <div className={cn(
        'relative z-10 flex items-center justify-center h-8 w-8 rounded-full shrink-0',
        colorClass,
        isFirst && 'ring-2 ring-background ring-offset-2 ring-offset-background'
      )}>
        <Icon className="h-4 w-4" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            {/* Event Label */}
            <p className="text-sm font-medium">
              {EVENT_LABELS[eventType] || eventType}
            </p>

            {/* Resident Name */}
            {residentName && (
              <p className="text-sm text-foreground">{residentName}</p>
            )}

            {/* Description */}
            {description && (
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            )}

            {/* Notes */}
            {event.notes && (
              <p className="text-xs text-muted-foreground mt-1 italic">
                &ldquo;{event.notes}&rdquo;
              </p>
            )}
          </div>

          {/* Date */}
          <div className="text-right shrink-0">
            {eventDate && (
              <p className="text-xs text-muted-foreground">{eventDate}</p>
            )}
            {endDate && (
              <p className="text-[10px] text-muted-foreground">to {endDate}</p>
            )}
            {event.is_current && (
              <Badge variant="secondary" className="text-[10px] mt-1">
                Current
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Generate a human-readable description for the event
 */
function getEventDescription(event: OwnershipHistoryWithEndDate): string | null {
  const eventType = event.event_type as OwnershipEventType;
  const roleLabel = event.resident_role
    ? ROLE_LABELS[event.resident_role as ResidentRole]
    : null;
  const previousRoleLabel = event.previous_role
    ? ROLE_LABELS[event.previous_role as ResidentRole]
    : null;

  switch (eventType) {
    case 'house_added':
      return 'Property registered in the system';
    case 'ownership_start':
      return roleLabel ? `Became the ${roleLabel}` : null;
    case 'ownership_transfer':
      return roleLabel ? `Transferred as ${roleLabel}` : null;
    case 'ownership_end':
      return 'Transferred ownership';
    case 'move_in':
      return roleLabel ? `Moved in as ${roleLabel}` : null;
    case 'move_out':
      return 'Left the property';
    case 'role_change':
      return previousRoleLabel && roleLabel
        ? `Changed from ${previousRoleLabel} to ${roleLabel}`
        : roleLabel
          ? `Role changed to ${roleLabel}`
          : null;
    default:
      return null;
  }
}
