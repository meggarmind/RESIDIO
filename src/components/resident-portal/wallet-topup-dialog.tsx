'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { CreditCard, Info, Copy, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';

interface WalletTopUpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentBalance?: number;
}

export function WalletTopUpDialog({
  open,
  onOpenChange,
  currentBalance = 0,
}: WalletTopUpDialogProps) {
  const [copied, setCopied] = useState(false);

  // TODO: Fetch from system settings
  const estateAccountNumber = '1234567890';
  const estateAccountName = 'Estate Management';
  const estateBankName = 'Example Bank';

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success(`${label} copied to clipboard`);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Top Up Wallet
          </DialogTitle>
          <DialogDescription>
            Add funds to your wallet to pay invoices and bills
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current Balance */}
          <div className="rounded-lg bg-muted p-4">
            <p className="text-sm text-muted-foreground">Current Balance</p>
            <p className="text-2xl font-bold">{formatCurrency(currentBalance)}</p>
          </div>

          {/* Payment Instructions */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              To top up your wallet, transfer funds to the estate account below. Please
              use your <strong>resident code</strong> as the payment reference.
            </AlertDescription>
          </Alert>

          {/* Bank Details */}
          <div className="space-y-3 rounded-lg border p-4">
            <h4 className="font-semibold text-sm">Bank Transfer Details</h4>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Account Name</p>
                  <p className="font-medium">{estateAccountName}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCopy(estateAccountName, 'Account name')}
                >
                  {copied ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Account Number</p>
                  <p className="font-medium font-mono">{estateAccountNumber}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCopy(estateAccountNumber, 'Account number')}
                >
                  {copied ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>

              <div>
                <p className="text-xs text-muted-foreground">Bank Name</p>
                <p className="font-medium">{estateBankName}</p>
              </div>
            </div>
          </div>

          {/* Important Notes */}
          <div className="rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 p-4">
            <h4 className="font-semibold text-sm text-amber-900 dark:text-amber-200 mb-2">
              Important Notes
            </h4>
            <ul className="text-xs text-amber-800 dark:text-amber-300 space-y-1 list-disc list-inside">
              <li>Always use your resident code as payment reference</li>
              <li>Funds typically reflect within 24 hours</li>
              <li>Contact estate management if payment is not credited after 48 hours</li>
              <li>Keep your transfer receipt for your records</li>
            </ul>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={() => onOpenChange(false)}>
              I've Made Payment
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
