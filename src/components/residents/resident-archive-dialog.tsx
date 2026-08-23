'use client';

import { Building2, CreditCard, StickyNote } from 'lucide-react';
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
import { usePayments } from '@/hooks/use-payments';
import { useNotes } from '@/hooks/use-notes';

interface ArchiveImpactSummaryProps {
  residentId: string;
  activeHouseCount: number;
}

export function ArchiveImpactSummary({ residentId, activeHouseCount }: ArchiveImpactSummaryProps) {
  const { data: pendingData, isLoading: pendingLoading } = usePayments({
    resident_id: residentId,
    status: 'pending',
    page: 1,
    limit: 1,
  });
  const { data: overdueData, isLoading: overdueLoading } = usePayments({
    resident_id: residentId,
    status: 'overdue',
    page: 1,
    limit: 1,
  });
  const { data: notesData, isLoading: notesLoading } = useNotes({
    entity_type: 'resident',
    entity_id: residentId,
    limit: 1,
  });

  const outstandingPayments = (pendingData?.count ?? 0) + (overdueData?.count ?? 0);
  const noteCount = notesData?.count ?? 0;
  const countsLoading = pendingLoading || overdueLoading || notesLoading;

  const rows = [
    {
      icon: Building2,
      label: 'House assignments',
      detail:
        activeHouseCount === 0
          ? 'No active assignments'
          : `${activeHouseCount} active assignment${activeHouseCount === 1 ? '' : 's'} will be deactivated`,
    },
    {
      icon: CreditCard,
      label: 'Outstanding payments',
      detail: countsLoading
        ? 'Checking…'
        : outstandingPayments === 0
          ? 'None'
          : `${outstandingPayments} outstanding payment${outstandingPayments === 1 ? '' : 's'} will remain in payment history`,
    },
    {
      icon: StickyNote,
      label: 'Notes',
      detail: countsLoading
        ? 'Checking…'
        : noteCount === 0
          ? 'None'
          : `${noteCount} note${noteCount === 1 ? '' : 's'} will be retained on the archived record`,
    },
  ];

  return (
    <div className="rounded-md border bg-muted/40 text-sm">
      <p className="px-3 pt-2.5 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        What will be affected
      </p>
      <div className="divide-y divide-border">
        {rows.map(({ icon: Icon, label, detail }) => (
          <div key={label} className="flex items-center gap-2.5 px-3 py-2">
            <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">{label}</span>
            <span className="ml-auto text-right font-medium">{detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface ResidentArchiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  residentId: string;
  residentName: string;
  activeHouseCount: number;
  onConfirm: () => void;
  isPending?: boolean;
}

export function ResidentArchiveDialog({
  open,
  onOpenChange,
  residentId,
  residentName,
  activeHouseCount,
  onConfirm,
  isPending,
}: ResidentArchiveDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive this resident?</AlertDialogTitle>
          <AlertDialogDescription>
            Archiving removes {residentName} from the active roster. Payment history and audit trails are
            preserved for record-keeping. This action cannot be undone from this screen.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ArchiveImpactSummary residentId={residentId} activeHouseCount={activeHouseCount} />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Archive Resident
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
