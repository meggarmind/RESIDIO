'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, HelpCircle, Home, ShieldCheck } from 'lucide-react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { IconBox } from '@/components/ui/icon-box';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { useHouses, useClearIdentifierFlag } from '@/hooks/use-houses';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { getPropertyShortname } from '@/lib/utils';

type UnverifiedHouse = {
  id: string;
  house_number: string;
  short_name?: string | null;
  identifier_note?: string | null;
  street?: { name: string } | null;
  house_type?: { name: string } | null;
};

/**
 * Issue #119 -- the remediation queue for doubted house identifiers.
 *
 * Lists every house whose `identifier_unverified` flag is set, with an action
 * to confirm the identifier and empty the row out of the queue. The confirm
 * control is gated on `houses.update`, not on the route's `houses.view`: a
 * read-only admin sees the queue and the doubt, but cannot resolve it.
 */
export function UnverifiedIdentifiersTable() {
  const { hasPermission } = useAuth();
  const canConfirm = hasPermission(PERMISSIONS.HOUSES_UPDATE);

  const { data, isLoading, error } = useHouses({
    identifier_unverified: true,
    limit: 100,
  });
  const clearMutation = useClearIdentifierFlag();

  const [target, setTarget] = useState<UnverifiedHouse | null>(null);
  const [note, setNote] = useState('');

  const houses = (data?.data ?? []) as unknown as UnverifiedHouse[];

  function openConfirm(house: UnverifiedHouse) {
    setTarget(house);
    setNote('');
  }

  async function handleConfirm() {
    if (!target) return;
    try {
      await clearMutation.mutateAsync({ id: target.id, note: note.trim() || null });
      setTarget(null);
    } catch {
      // The mutation hook surfaces the failure as a toast; keep the dialog open
      // so the operator can retry rather than losing the note they typed.
    }
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-8 text-center text-destructive">
        <p className="font-semibold">Could not load unconfirmed identifiers</p>
        <p className="text-sm opacity-80">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="border-b hover:bg-transparent">
              <TableHead className="w-[120px]">ID</TableHead>
              <TableHead>House</TableHead>
              <TableHead>Street</TableHead>
              <TableHead>Recorded doubt</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(3)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-5 w-16 rounded" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="ml-auto h-8 w-24 rounded-md" /></TableCell>
                </TableRow>
              ))
            ) : houses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-[280px] text-center">
                  <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                    <IconBox color="green" size="md" className="mb-2">
                      <CheckCircle2 className="h-6 w-6" />
                    </IconBox>
                    <p className="font-medium text-foreground">No unconfirmed identifiers</p>
                    <p className="text-sm">Every house identifier in the register has been confirmed.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              houses.map((house) => (
                <TableRow key={house.id} className="group">
                  <TableCell>
                    <Link
                      href={`/houses/${house.id}`}
                      className="rounded border bg-muted px-2 py-1 font-mono text-sm font-semibold text-foreground/80 transition-colors hover:bg-background"
                    >
                      {getPropertyShortname(house)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="rounded bg-secondary/20 p-1 text-secondary-foreground">
                        <Home className="h-4 w-4" />
                      </div>
                      <span className="font-medium">{house.house_number}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{house.street?.name ?? '-'}</TableCell>
                  <TableCell className="max-w-[380px] text-sm text-muted-foreground">
                    {house.identifier_note || 'No note recorded.'}
                  </TableCell>
                  <TableCell className="text-right">
                    {canConfirm ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openConfirm(house)}
                        aria-label={`Confirm identifier for ${house.house_number}`}
                      >
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        Confirm identifier
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">View only</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={target !== null} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <div className="mb-2 flex justify-center">
              <IconBox color="orange" size="md">
                <HelpCircle className="h-6 w-6" />
              </IconBox>
            </div>
            <DialogTitle>Confirm this identifier?</DialogTitle>
            <DialogDescription>
              This records that <span className="font-mono font-semibold">{target?.house_number}</span> is
              the correct identifier as recorded, and removes it from the confirmation queue. The
              identifier itself is not changed — edit the house if the value is wrong.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="identifier-confirmation-note">What settled the doubt? (optional)</Label>
            <Textarea
              id="identifier-confirmation-note"
              placeholder="e.g. Confirmed on site with the resident, 9 Sep 2026"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="min-h-[80px]"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)} disabled={clearMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={clearMutation.isPending}>
              {clearMutation.isPending ? 'Confirming...' : 'Confirm identifier'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
