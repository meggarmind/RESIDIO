'use client';

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import type { DuplicateMatchReason, DuplicateResidentMatch } from '@/lib/residents/duplicate-match';

const REASON_LABELS: Record<DuplicateMatchReason, string> = {
  phone: 'Same phone number',
  email: 'Same email',
  name: 'Same name',
};

type DuplicateResidentDialogProps = {
  matches: DuplicateResidentMatch[] | null;
  /** Linking needs a house and role on the form; without them only "create anyway" is possible. */
  canLink: boolean;
  isPending: boolean;
  onLink: (residentId: string) => void;
  onCreateAnyway: () => void;
  onCancel: () => void;
};

/** Shown when a new resident matches an existing one (#820). Linking is the default choice. */
export function DuplicateResidentDialog({
  matches,
  canLink,
  isPending,
  onLink,
  onCreateAnyway,
  onCancel,
}: DuplicateResidentDialogProps) {
  return (
    <AlertDialog open={!!matches}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>This person may already be a resident</AlertDialogTitle>
          <AlertDialogDescription>
            One person or company with several houses should be one resident linked to each house, so
            bills, statements and WhatsApp stay in one place.
            {!canLink && ' Choose a house and role on the form to link this house to an existing resident.'}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <ul className="space-y-3">
          {(matches ?? []).map((match) => (
            <li key={match.resident_id} className="rounded-md border p-3 space-y-2">
              <div>
                <p className="font-medium">
                  {match.name} <span className="text-muted-foreground">({match.resident_code})</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {match.reasons.map((reason) => REASON_LABELS[reason]).join(', ')}
                  {' · '}
                  {match.houses.length ? `Houses: ${match.houses.join(', ')}` : 'No houses yet'}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={!canLink || isPending}
                onClick={() => onLink(match.resident_id)}
              >
                Link house to existing resident
              </Button>
            </li>
          ))}
        </ul>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" disabled={isPending} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="outline" disabled={isPending} onClick={onCreateAnyway}>
            Create new resident anyway
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
