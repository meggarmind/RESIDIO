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
import { AccountStatusBadge, ResidentRoleBadge } from '@/components/residents/status-badge';
import { useResident } from '@/hooks/use-residents';
import { Home, Loader2, Phone, Users } from 'lucide-react';

interface ResidentQuickViewProps {
  residentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ResidentQuickView({ residentId, open, onOpenChange }: ResidentQuickViewProps) {
  const { data: resident, isLoading, error } = useResident(residentId ?? undefined);
  const activeHouses = resident?.resident_houses?.filter((assignment) => assignment.is_active) ?? [];

  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange} variant="drawer" drawerWidth="md">
      <ResponsiveSheetHeader>
        <ResponsiveSheetTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          {resident ? `${resident.first_name} ${resident.last_name}` : 'Resident preview'}
        </ResponsiveSheetTitle>
        <ResponsiveSheetDescription>
          Review the resident without leaving the registry.
        </ResponsiveSheetDescription>
      </ResponsiveSheetHeader>

      <ResponsiveSheetBody>
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : error || !resident ? (
          <p className="py-8 text-sm text-destructive">Unable to load this resident.</p>
        ) : (
          <div className="space-y-6 pb-6">
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-mono text-sm">{resident.resident_code}</p>
                  <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground"><Phone className="h-4 w-4" />{resident.phone_primary}</p>
                </div>
                <AccountStatusBadge status={resident.account_status} />
              </div>
            </div>

            <section>
              <div className="mb-3 flex items-center gap-2 text-sm font-medium"><Home className="h-4 w-4" /> Properties ({activeHouses.length})</div>
              {activeHouses.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active property assignments.</p>
              ) : (
                <div className="space-y-2">
                  {activeHouses.map((assignment) => (
                    <div key={assignment.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                      <Link href={`/houses/${assignment.house?.id}`} className="min-w-0 truncate text-sm font-medium hover:underline">
                        {assignment.house?.house_number} {assignment.house?.street?.name}
                      </Link>
                      <ResidentRoleBadge role={assignment.resident_role} />
                    </div>
                  ))}
                </div>
              )}
            </section>

            <Button className="w-full" asChild><Link href={`/residents/${resident.id}`}>Open full record</Link></Button>
          </div>
        )}
      </ResponsiveSheetBody>
    </ResponsiveSheet>
  );
}
