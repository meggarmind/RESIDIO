'use client';

import * as React from 'react';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Wallet, CreditCard, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import { payInvoiceWithWallet } from '@/actions/billing/pay-invoice-with-wallet';
import { PaystackPayButton } from '@/components/payments/paystack-pay-button';
import { toast } from 'sonner';
import type { Invoice } from '@/types/database';

/**
 * Payment Dialog Manager Component
 *
 * Unified payment dialog handling both wallet and Paystack flows.
 * Displays invoice details and payment options based on wallet balance.
 *
 * Features:
 * - Wallet payment (if sufficient balance)
 * - Paystack online payment (always available)
 * - Clear messaging about payment methods
 * - Success callback for query invalidation
 */

interface PaymentDialogManagerProps {
  /** Invoice to pay */
  invoice: Invoice | null;
  /** Dialog open state */
  open: boolean;
  /** Open state change handler */
  onOpenChange: (open: boolean) => void;
  /** Current wallet balance */
  walletBalance: number;
  /** Success callback */
  onSuccess: () => void;
}

export function PaymentDialogManager({
  invoice,
  open,
  onOpenChange,
  walletBalance,
  onSuccess,
}: PaymentDialogManagerProps) {
  const [isPayingWithWallet, setIsPayingWithWallet] = useState(false);

  if (!invoice) return null;

  const amountDue = (invoice.amount_due || 0) - (invoice.amount_paid || 0);
  const canPayWithWallet = walletBalance >= amountDue;

  const handleWalletPayment = async () => {
    setIsPayingWithWallet(true);

    try {
      const result = await payInvoiceWithWallet(invoice.id);

      if (!result.success) {
        toast.error(result.error || 'Payment failed');
        return;
      }

      if (result.invoiceFullyPaid) {
        toast.success('Payment successful! Invoice paid in full.');
      } else {
        toast.success(`Partial payment of ${formatCurrency(result.amountPaid)} applied.`);
      }

      // Close dialog and trigger success callback
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error('Wallet payment error:', error);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setIsPayingWithWallet(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Pay Invoice
          </DialogTitle>
          <DialogDescription>
            Choose a payment method to complete your transaction
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Invoice Details */}
          <div
            className="rounded-lg p-4"
            style={{
              background: 'var(--color-bg-muted)',
              border: '1px solid var(--color-border)',
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">Invoice Number</p>
              <p className="font-medium">{invoice.invoice_number}</p>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Amount Due</p>
              <p className="text-2xl font-bold">{formatCurrency(amountDue)}</p>
            </div>
          </div>

          {/* Wallet Balance Info */}
          <Alert>
            <Wallet className="h-4 w-4" />
            <AlertDescription>
              <span className="font-medium">Wallet Balance: </span>
              <span className={cn(
                'font-semibold',
                canPayWithWallet ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'
              )}>
                {formatCurrency(walletBalance)}
              </span>
            </AlertDescription>
          </Alert>

          {/* Payment Options */}
          <div className="space-y-3">
            {/* Wallet Payment Button */}
            {canPayWithWallet ? (
              <Button
                onClick={handleWalletPayment}
                disabled={isPayingWithWallet}
                className="w-full gap-2"
                size="lg"
              >
                {isPayingWithWallet ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing Payment...
                  </>
                ) : (
                  <>
                    <Wallet className="h-4 w-4" />
                    Pay with Wallet ({formatCurrency(walletBalance)})
                  </>
                )}
              </Button>
            ) : (
              <Alert variant="warning">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Insufficient wallet balance. You need {formatCurrency(amountDue - walletBalance)} more to pay with wallet.
                </AlertDescription>
              </Alert>
            )}

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" style={{ borderColor: 'var(--color-border)' }} />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span
                  className="px-2"
                  style={{
                    background: 'var(--color-bg-card)',
                    color: 'var(--color-text-muted)',
                  }}
                >
                  Or
                </span>
              </div>
            </div>

            {/* Paystack Payment Button */}
            <PaystackPayButton
              invoiceId={invoice.id}
              amount={amountDue}
              invoiceNumber={invoice.invoice_number || ''}
              variant="outline"
              size="lg"
              fullWidth
            />
          </div>

          {/* Info Box */}
          <div
            className="rounded-lg p-4 space-y-2"
            style={{
              background: 'var(--color-bg-muted)',
              border: '1px solid var(--color-border)',
            }}
          >
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-600" />
              <div>
                <p className="text-sm font-medium">Secure Payment</p>
                <p className="text-xs text-muted-foreground">
                  All transactions are encrypted and secure
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-600" />
              <div>
                <p className="text-sm font-medium">Instant Processing</p>
                <p className="text-xs text-muted-foreground">
                  Wallet payments process immediately. Online payments may take a few minutes.
                </p>
              </div>
            </div>
          </div>

          {/* Cancel Button */}
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="w-full"
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
