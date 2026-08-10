'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  ResponsiveSheet,
  ResponsiveSheetBody,
  ResponsiveSheetDescription,
  ResponsiveSheetHeader,
  ResponsiveSheetTitle,
} from '@/components/ui/responsive-sheet';
import { OccupancyBadge, ResidentRoleBadge } from '@/components/residents/status-badge';
import { useHouse } from '@/hooks/use-houses';
import { Home, Loader2, Users } from 'lucide-react';
import type { ResidentRole } from '@/types/database';

interface HouseQuickViewProps {
  houseId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HouseQuickView({ houseId, open, onOpenChange }: HouseQuickViewProps) {
  const { data: house, isLoading, error } = useHouse(houseId ?? undefined);
  const activeResidents = house?.resident_houses?.filter((assignment) => assignment.is_active) ?? [];

  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange} variant="drawer" drawerWidth="md">
      <ResponsiveSheetHeader>
        <ResponsiveSheetTitle className="flex items-center gap-2">
          <Home className="h-5 w-5" />
          {house ? `${house.house_number} ${house.street?.name ?? ''}`.trim() : 'Property preview'}
        </ResponsiveSheetTitle>
        <ResponsiveSheetDescription>
          Review the property without leaving the registry.
        </ResponsiveSheetDescription>
      </ResponsiveSheetHeader>

      <ResponsiveSheetBody>
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : error || !house ? (
          <p className="py-8 text-sm text-destructive">Unable to load this property.</p>
        ) : (
          <div className="space-y-6 pb-6">
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Property type</p>
                  <p className="mt-1 font-medium">{house.house_type?.name ?? 'Not specified'}</p>
                </div>
                <OccupancyBadge isOccupied={house.is_occupied} />
              </div>
            </div>

            <section>
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <Users className="h-4 w-4" /> Residents ({activeResidents.length})
              </div>
              {activeResidents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No residents are assigned.</p>
              ) : (
                <div className="space-y-2">
                  {activeResidents.map((assignment) => (
                    <div key={assignment.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                      <Link href={`/residents/${assignment.resident.id}`} className="min-w-0 truncate text-sm font-medium hover:underline">
                        {assignment.resident.first_name} {assignment.resident.last_name}
                      </Link>
                      <ResidentRoleBadge role={assignment.resident_role as ResidentRole} />
                    </div>
                  ))}
                </div>
              )}
            </section>

            <Button className="w-full" asChild>
              <Link href={`/houses/${house.id}`}>Open full record</Link>
            </Button>
          </div>
        )}
      </ResponsiveSheetBody>
    </ResponsiveSheet>
  );
}
