'use client';

import { Users, Phone, Crown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { ResidentSummary } from '@/actions/houses/get-house-residents';
import type { ResidentRole } from '@/types/database';
import {
  getInitials,
  getDisplayName,
  getAvatarColor,
} from './resident-avatar-cluster';

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

interface CurrentOccupantsCardProps {
  residents: ResidentSummary[];
  className?: string;
}

export function CurrentOccupantsCard({
  residents,
  className,
}: CurrentOccupantsCardProps) {
  if (residents.length === 0) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Current Occupants
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <Users className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No residents currently assigned</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4" />
          Current Occupants
          <Badge variant="secondary" className="ml-auto text-xs">
            {residents.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {residents.map((resident) => (
          <ResidentItem key={resident.id} resident={resident} />
        ))}
      </CardContent>
    </Card>
  );
}

interface ResidentItemProps {
  resident: ResidentSummary;
}

function ResidentItem({ resident }: ResidentItemProps) {
  const displayName = getDisplayName(resident);
  const initials = getInitials(resident);
  const avatarColor = getAvatarColor(resident.id);

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors">
      {/* Avatar */}
      <Avatar className="h-10 w-10">
        <AvatarFallback className={cn(avatarColor, 'text-white text-sm font-medium')}>
          {initials}
        </AvatarFallback>
      </Avatar>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{displayName}</span>
          {resident.is_primary && (
            <Crown className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <Badge
            variant="outline"
            className={cn('text-[10px]', roleColors[resident.resident_role])}
          >
            {roleLabels[resident.resident_role] || resident.resident_role}
          </Badge>
          {resident.is_primary && (
            <Badge className="text-[10px] bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800">
              Primary
            </Badge>
          )}
        </div>
      </div>

      {/* Phone */}
      {resident.phone_primary && (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Phone className="h-3.5 w-3.5" />
          <span className="text-xs">{resident.phone_primary}</span>
        </div>
      )}
    </div>
  );
}
