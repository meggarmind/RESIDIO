'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Split } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCan } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { formatCurrency } from '@/lib/utils';
import { updateHouseDuesSetting } from '@/actions/houses/update-house-dues-setting';
import { getLandlordDuesSplit, splitLandlordDues } from '@/actions/billing/landlord-dues-split';
import { DUES_REMINDER_TARGETS, DUES_REMINDER_TARGET_LABELS, type DuesReminderTarget } from '@/lib/billing/landlord-dues';

interface LandlordDuesCardProps {
  house: { id: string; dues_paid_by_landlord: boolean; dues_reminder_target: string };
}

/** House setting "Dues paid by landlord" (#1192): the setting, who gets reminders, and Split to tenants. */
export function LandlordDuesCard({ house }: LandlordDuesCardProps) {
  const queryClient = useQueryClient();
  const canUpdate = useCan(PERMISSIONS.HOUSES_UPDATE);
  const canSplit = useCan(PERMISSIONS.BILLING_TRANSFER_WALLET_CREDIT);
  const [paidByLandlord, setPaidByLandlord] = useState(house.dues_paid_by_landlord);
  const [target, setTarget] = useState<DuesReminderTarget>(
    (DUES_REMINDER_TARGETS as readonly string[]).includes(house.dues_reminder_target)
      ? (house.dues_reminder_target as DuesReminderTarget)
      : 'tenant',
  );
  const [splitOpen, setSplitOpen] = useState(false);

  const save = useMutation({
    mutationFn: async () => {
      const result = await updateHouseDuesSetting(house.id, { duesPaidByLandlord: paidByLandlord, duesReminderTarget: target });
      if (result.error) throw new Error(result.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['house', house.id] });
      toast.success('Dues setting saved');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const changed = paidByLandlord !== house.dues_paid_by_landlord || target !== house.dues_reminder_target;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dues paid by landlord</CardTitle>
        <CardDescription>The tenant still owes the dues; the landlord pays them.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="dues-paid-by-landlord">Dues paid by landlord</Label>
          <Switch
            id="dues-paid-by-landlord"
            checked={paidByLandlord}
            onCheckedChange={setPaidByLandlord}
            disabled={!canUpdate}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="dues-reminder-target">Dues reminders go to</Label>
          <Select value={target} onValueChange={(value) => setTarget(value as DuesReminderTarget)} disabled={!canUpdate || !paidByLandlord}>
            <SelectTrigger id="dues-reminder-target" className="w-full sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DUES_REMINDER_TARGETS.map((value) => (
                <SelectItem key={value} value={value}>{DUES_REMINDER_TARGET_LABELS[value]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          {canUpdate && (
            <Button size="sm" onClick={() => save.mutate()} disabled={!changed || save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          )}
          {canSplit && house.dues_paid_by_landlord && (
            <Button size="sm" variant="outline" onClick={() => setSplitOpen(true)}>
              <Split className="mr-2 h-4 w-4" />
              Split to tenants
            </Button>
          )}
        </div>
      </CardContent>
      {canSplit && (
        <Dialog open={splitOpen} onOpenChange={setSplitOpen}>
          <DialogContent className="sm:max-w-[560px]">
            {/* Mounted only while open, so every opening reads fresh balances. */}
            {splitOpen && <SplitForm houseId={house.id} onDone={() => setSplitOpen(false)} />}
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

function SplitForm({ houseId, onDone }: { houseId: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const { data: plan, isLoading, error } = useQuery({
    queryKey: ['landlord-dues-split', houseId],
    queryFn: async () => {
      const result = await getLandlordDuesSplit(houseId);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    staleTime: 0,
  });
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const key = (flat: { houseId: string; tenantId: string }) => `${flat.houseId}:${flat.tenantId}`;
  const amountOf = (flat: { houseId: string; tenantId: string; owed: number }) => amounts[key(flat)] ?? flat.owed;

  const split = useMutation({
    mutationFn: async () => {
      const allocations = (plan?.flats || [])
        .map((flat) => ({ houseId: flat.houseId, tenantId: flat.tenantId, amount: amountOf(flat) }))
        .filter((a) => a.amount > 0);
      const result = await splitLandlordDues({ houseId, allocations });
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['landlord-dues-split', houseId] });
      const failed = result.results.filter((r) => !r.success || r.error);
      if (failed.length > 0) toast.warning(`Split done with ${failed.length} problem(s): ${failed.map((r) => r.error).join('; ')}`);
      else toast.success('Split to tenants done');
      if (result.receiptErrors.length > 0) toast.warning(`Some receipts were not sent: ${result.receiptErrors.join('; ')}`);
      onDone();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const total = (plan?.flats || []).reduce((sum, flat) => sum + amountOf(flat), 0);
  const overBalance = plan ? total > plan.walletBalance : false;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Split to tenants</DialogTitle>
        <DialogDescription>
          Pay each tenant&apos;s dues from the landlord&apos;s Dues wallet. Edit an amount, or set it to 0 to leave a flat out.
        </DialogDescription>
      </DialogHeader>

      {isLoading && <Loader2 className="mx-auto h-6 w-6 animate-spin" aria-label="Loading" />}
      {error && <p className="text-sm text-destructive" role="alert">{(error as Error).message}</p>}
      {plan && (
        <div className="space-y-4">
          <p className="text-sm">
            {plan.landlord.name}: Dues wallet {formatCurrency(plan.walletBalance)}
          </p>
          {plan.flats.length === 0 && <p className="text-sm text-muted-foreground">No tenant owes dues in this landlord&apos;s flats.</p>}
          {plan.flats.map((flat) => (
            <div key={key(flat)} className="grid gap-1">
              <Label htmlFor={`split-${key(flat)}`}>
                {flat.houseLabel}, {flat.tenantName} (owes {formatCurrency(flat.owed)})
              </Label>
              <CurrencyInput
                id={`split-${key(flat)}`}
                value={amountOf(flat)}
                onValueChange={(value) => setAmounts((prev) => ({ ...prev, [key(flat)]: value || 0 }))}
              />
            </div>
          ))}
          <p className="text-sm font-medium">Total {formatCurrency(total)}</p>
          {overBalance && <p className="text-sm text-destructive">The total is more than the Dues wallet holds.</p>}
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onDone}>Cancel</Button>
        <Button
          onClick={() => split.mutate()}
          disabled={!plan || plan.flats.length === 0 || total <= 0 || overBalance || split.isPending}
        >
          {split.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Split
        </Button>
      </DialogFooter>
    </>
  );
}
