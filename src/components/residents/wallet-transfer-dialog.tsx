'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTransferWalletCredit, useWalletTransferTargets } from '@/hooks/use-wallet';
import type { ResidentWalletLine } from '@/actions/billing/wallet';
import { formatCurrency } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface WalletTransferDialogProps {
  residentId: string;
  wallets: ResidentWalletLine[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Transfer credit (#1191): from one of this resident's wallets to another of their wallets, or to a
 * wallet of a resident linked to the same house. The receiving wallet then settles its owner's unpaid
 * invoices of that category in the chosen house.
 */
export function WalletTransferDialog({ residentId, wallets, open, onOpenChange }: WalletTransferDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        {/* Mounted only while open, so every opening starts from an empty form. */}
        {open && <WalletTransferForm residentId={residentId} wallets={wallets} onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  );
}

function WalletTransferForm({ residentId, wallets, onOpenChange }: Omit<WalletTransferDialogProps, 'open'>) {
  const { data: targets = [], isLoading: targetsLoading } = useWalletTransferTargets(residentId);
  const transfer = useTransferWalletCredit();

  const fundedWallets = wallets.filter((line) => line.wallet_id && line.balance > 0);
  const [fromCategory, setFromCategory] = useState('');
  const [chosenHouseId, setHouseId] = useState('');
  const [toResidentId, setToResidentId] = useState(residentId);
  const [toCategory, setToCategory] = useState('');
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState('');

  // The only house is chosen by default.
  const houseId = chosenHouseId || (targets.length === 1 ? targets[0].houseId : '');
  const source = fundedWallets.find((line) => line.charge_category === fromCategory);
  const house = targets.find((target) => target.houseId === houseId);
  const recipients = house?.residents ?? [];
  const sameWallet = toResidentId === residentId && toCategory === fromCategory;
  const exceedsBalance = !!source && amount > source.balance;
  const canSubmit =
    !!source && !!toCategory && amount > 0 && !exceedsBalance && !sameWallet && reason.trim().length > 0 &&
    (targets.length === 0 || !!house);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!source?.wallet_id || !canSubmit) return;
    try {
      await transfer.mutateAsync({
        fromWalletId: source.wallet_id,
        toResidentId,
        toChargeCategory: toCategory,
        amount,
        reason: reason.trim(),
        houseId: house?.houseId ?? null,
      });
      onOpenChange(false);
    } catch {
      // Error is handled by the mutation
    }
  };

  return (
    <form onSubmit={onSubmit}>
      <DialogHeader>
        <DialogTitle>Transfer credit</DialogTitle>
        <DialogDescription>
          Move credit to another wallet of this resident, or to a resident linked to the same house.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label htmlFor="transfer-from">From wallet</Label>
          <Select value={fromCategory} onValueChange={setFromCategory}>
            <SelectTrigger id="transfer-from">
              <SelectValue placeholder={fundedWallets.length ? 'Select a wallet' : 'No wallet holds credit'} />
            </SelectTrigger>
            <SelectContent>
              {fundedWallets.map((line) => (
                <SelectItem key={line.charge_category} value={line.charge_category}>
                  {line.name} ({formatCurrency(line.balance)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {targets.length > 0 && (
          <div className="grid gap-2">
            <Label htmlFor="transfer-house">House</Label>
            <Select
              value={houseId}
              onValueChange={(value) => {
                setHouseId(value);
                setToResidentId(residentId);
              }}
            >
              <SelectTrigger id="transfer-house">
                <SelectValue placeholder="Select a house" />
              </SelectTrigger>
              <SelectContent>
                {targets.map((target) => (
                  <SelectItem key={target.houseId} value={target.houseId}>
                    {target.houseLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              The receiving wallet pays its owner&apos;s unpaid invoices for this house.
            </p>
          </div>
        )}
        {!targetsLoading && targets.length === 0 && (
          <p className="text-xs text-muted-foreground">
            This resident is not linked to a house, so credit can only move between their own wallets.
          </p>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="transfer-to-resident">To resident</Label>
            <Select value={toResidentId} onValueChange={setToResidentId} disabled={recipients.length === 0}>
              <SelectTrigger id="transfer-to-resident">
                <SelectValue placeholder="This resident" />
              </SelectTrigger>
              <SelectContent>
                {(recipients.length ? recipients : [{ id: residentId, name: 'This resident' }]).map((recipient) => (
                  <SelectItem key={recipient.id} value={recipient.id}>
                    {recipient.id === residentId ? `${recipient.name} (this resident)` : recipient.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="transfer-to-wallet">To wallet</Label>
            <Select value={toCategory} onValueChange={setToCategory}>
              <SelectTrigger id="transfer-to-wallet">
                <SelectValue placeholder="Select a wallet" />
              </SelectTrigger>
              <SelectContent>
                {wallets.map((line) => (
                  <SelectItem key={line.charge_category} value={line.charge_category}>
                    {line.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {sameWallet && <p className="text-sm text-destructive">Choose a different wallet to receive the credit.</p>}

        <div className="grid gap-2">
          <Label htmlFor="transfer-amount">Amount</Label>
          <CurrencyInput id="transfer-amount" value={amount} onValueChange={(value) => setAmount(value || 0)} placeholder="0.00" />
          {exceedsBalance && (
            <p className="text-sm text-destructive">Cannot transfer more than the wallet holds ({formatCurrency(source.balance)})</p>
          )}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="transfer-reason">Reason</Label>
          <Textarea
            id="transfer-reason"
            placeholder="Why is this credit being moved?"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={transfer.isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={transfer.isPending || !canSubmit}>
          {transfer.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Transfer credit
        </Button>
      </DialogFooter>
    </form>
  );
}
