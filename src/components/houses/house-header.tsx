'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { HouseNeighbourNav } from '@/components/houses/house-neighbour-nav';
import { IdentifierUnverifiedBadge } from '@/components/houses/identifier-unverified-badge';
import { OccupancyBadge } from '@/components/residents/status-badge';
import { useDeleteHouse } from '@/hooks/use-houses';
import { useHousePaymentStatus } from '@/hooks/use-billing';
import { useCan } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { DebtStatusBadge } from '@/components/billing/debt-status-badge';
import { formatCurrency } from '@/lib/utils';
import { ArrowLeft, Loader2, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { HouseWithResidents } from '@/types/database';

const headerButtonClass = 'min-h-11 md:min-h-0 md:h-9';

interface HouseHeaderProps {
  house: HouseWithResidents;
  activeResidentCount: number;
}

/** Title, one status line (occupancy, residents, outstanding) and the house-level actions (#784). */
export function HouseHeader({ house, activeResidentCount }: HouseHeaderProps) {
  const router = useRouter();
  const canUpdateHouse = useCan(PERMISSIONS.HOUSES_UPDATE);
  const canDeleteHouse = useCan(PERMISSIONS.HOUSES_DELETE);
  const deleteMutation = useDeleteHouse();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const { data: paymentStatus, isLoading: isPaymentLoading, isError: isPaymentError } = useHousePaymentStatus(house.id);

  const hasResidents = activeResidentCount > 0;
  const outstanding = paymentStatus?.totalOutstanding;

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(house.id);
      toast.success('House deleted successfully');
      router.push('/houses');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete house');
    }
  };

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <Button variant="ghost" size="icon" className="size-11 shrink-0 md:size-9" asChild aria-label="Go back">
          <Link href="/houses">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="min-w-0 space-y-1">
          <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xl font-bold break-words sm:text-3xl">
            <span className="min-w-0">{house.house_number} {house.street?.name}</span>
            {/* Issue #119: the recorded identifier is doubted. */}
            <IdentifierUnverifiedBadge unverified={house.identifier_unverified} note={house.identifier_note} />
          </h1>
          <p className="text-muted-foreground">{house.house_type?.name ?? 'No type specified'}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" data-testid="house-status-line">
            <OccupancyBadge isOccupied={house.is_occupied} />
            <span>{activeResidentCount} {activeResidentCount === 1 ? 'resident' : 'residents'}</span>
            <span className="text-muted-foreground" aria-hidden="true">·</span>
            {/* Never show a debt status while the figure is unknown. */}
            {isPaymentLoading ? (
              <span className="text-muted-foreground">Checking dues…</span>
            ) : isPaymentError || typeof outstanding !== 'number' ? (
              <span className="text-muted-foreground">Debt status unavailable</span>
            ) : (
              <>
                <DebtStatusBadge status={paymentStatus!.debtStatus} label={paymentStatus!.debtStatusLabel} />
                {outstanding > 0 && <span className="font-medium">{formatCurrency(outstanding)}</span>}
              </>
            )}
          </div>
          {house.notes && <p className="text-sm text-muted-foreground">{house.notes}</p>}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 pl-14 sm:pl-0">
        <HouseNeighbourNav houseId={house.id} />
        {canUpdateHouse && (
          <Button variant="outline" asChild className={headerButtonClass}>
            <Link href={`/houses/${house.id}?edit=true`}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Link>
          </Button>
        )}
        {canDeleteHouse && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className={`${headerButtonClass} min-w-11 md:min-w-0`} aria-label="More house actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-w-64">
              <DropdownMenuItem
                variant="destructive"
                disabled={hasResidents || deleteMutation.isPending}
                onSelect={() => setIsDeleteDialogOpen(true)}
                className="flex-col items-start gap-0.5"
              >
                <span className="flex items-center">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete house
                </span>
                {hasResidents && (
                  <span className="text-xs text-muted-foreground" data-testid="delete-disabled-reason">
                    Remove all residents before deleting this house.
                  </span>
                )}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this house?</AlertDialogTitle>
            <AlertDialogDescription>
              {house.house_number} {house.street?.name} will be removed from the estate register. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
