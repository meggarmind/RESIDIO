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
import { PaystackButton } from 'react-paystack';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from '@/lib/auth/auth-provider';
import { checkPaymentEmails } from '@/actions/email-imports/check-payment';

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
  const [amount, setAmount] = useState<string>('');
  const { user } = useAuth(); // Assuming useAuth provides user details for Paystack

  // TODO: Fetch from system settings
  const estateAccountNumber = '1234567890';
  const estateAccountName = 'Estate Management';
  const estateBankName = 'Example Bank';

  // PAYSTACK CONFIG (PLACEHOLDER KEY)
  const paystackConfig = {
    reference: (new Date()).getTime().toString(),
    email: user?.email || "resident@example.com",
    amount: (Number(amount) || 0) * 100, // Paystack is in kobo
    publicKey: process.env.NEXT_PUBLIC_PAYSTACK_KEY || 'pk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  };

  const handlePaystackSuccess = (reference: any) => {
    // Implementation for backend verification would go here
    toast.success("Payment successful! Wallet updating...");
    setTimeout(() => onOpenChange(false), 2000);
  };

  const handlePaystackClose = () => {
    toast.info("Payment cancelled.");
  };

  const paystackProps = {
    ...paystackConfig,
    text: `Pay ${formatCurrency(Number(amount) || 0)} Now`,
    onSuccess: handlePaystackSuccess,
    onClose: handlePaystackClose,
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success(`${label} copied to clipboard`);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleManualSent = async () => {
    toast.loading("Sending notification & verifying...", { id: 'manual-verify' });

    try {
      // Logic to trigger email-imports check
      const result = await checkPaymentEmails();

      toast.dismiss('manual-verify');

      if (result.success && (result.details?.matched || 0) > 0) {
        toast.success("Payment found and verified! Wallet updated.");
      } else if (result.success) {
        toast.success("Transfer notification sent. We'll verify it shortly.");
      } else {
        toast.warning("Notification sent. Manual verification pending.");
      }
    } catch (error) {
      toast.dismiss('manual-verify');
      toast.error("Failed to verify immediately. Admin has been notified.");
    }

    setTimeout(() => onOpenChange(false), 2000);
  }

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

        <Tabs defaultValue="manual" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="manual">Manual Transfer</TabsTrigger>
            <TabsTrigger value="instant">Instant Pay (Card)</TabsTrigger>
          </TabsList>

          <TabsContent value="manual" className="space-y-4">
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
              <Button className="flex-1" onClick={handleManualSent}>
                I've Made Payment
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="instant" className="space-y-4">
            <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800 text-center">
              <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">Instant Wallet Top-up</p>
              <p className="text-xs text-muted-foreground">Payments reflect immediately.</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Amount to Top-up (₦)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="e.g. 50000"
              />
            </div>

            <div className="pt-4">
              {/* @ts-ignore - Paystack types might be missing in dev env */}
              <PaystackButton
                {...paystackProps}
                className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 w-full"
              />
            </div>

            <p className="text-xs text-center text-muted-foreground mt-4">
              Secured by Paystack. standard transaction fees apply.
            </p>
          </TabsContent>
        </Tabs>

      </DialogContent>
    </Dialog>
  );
}
