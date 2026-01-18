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
import { CreditCard, Info, Copy, CheckCircle2, Upload, FileText, Camera } from 'lucide-react';
import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';
import { PaystackButton } from 'react-paystack';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from '@/lib/auth/auth-provider';
import { checkPaymentEmails } from '@/actions/email-imports/check-payment';
import { submitPaymentProof } from '@/actions/payments/submit-payment-proof';
import { verifyPaystackPayment } from '@/actions/payments/verify-paystack-payment';

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
  const [manualAmount, setManualAmount] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();

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

  const handlePaystackSuccess = async (reference: any) => {
    const toastId = toast.loading("Verifying payment...");
    try {
      const result = await verifyPaystackPayment({
        reference: reference.reference,
        amount: Number(amount),
      });

      if (result.success) {
        toast.success("Payment successful! Wallet updated.", { id: toastId });
        onOpenChange(false);
      } else {
        toast.error(result.error || "Failed to verify payment.", { id: toastId });
      }
    } catch (error) {
      toast.error("Verification failed.", { id: toastId });
    }
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleManualSent = async () => {
    if (!manualAmount || Number(manualAmount) <= 0) {
      toast.error("Please enter the amount you transferred.");
      return;
    }

    if (!selectedFile) {
      toast.error("Please upload a proof of payment (receipt).");
      return;
    }

    setIsSubmitting(true);
    const toastId = toast.loading("Submitting payment proof...");

    try {
      const formData = new FormData();
      formData.append('amount', manualAmount);
      formData.append('proof', selectedFile);
      formData.append('notes', `Manual transfer proof for ₦${manualAmount}`);

      const result = await submitPaymentProof(formData);

      if (result.success) {
        toast.success(result.warning || "Payment proof submitted! Admin will verify it shortly.", { id: toastId });

        // Trigger background email check as well for immediate match if possible
        checkPaymentEmails().catch(console.error);

        onOpenChange(false);
        // Reset state
        setManualAmount('');
        setSelectedFile(null);
      } else {
        toast.error(result.error || "Failed to submit proof.", { id: toastId });
      }
    } catch (error) {
      toast.error("An unexpected error occurred.", { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
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

          <TabsContent value="manual" className="space-y-4 pb-4">
            {/* Current Balance */}
            <div className="rounded-lg bg-muted p-4">
              <p className="text-sm text-muted-foreground">Current Balance</p>
              <p className="text-2xl font-bold">{formatCurrency(currentBalance)}</p>
            </div>

            {/* Payment Instructions */}
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Transfer funds to the estate account below and upload your receipt for verification.
              </AlertDescription>
            </Alert>

            {/* Bank Details */}
            <div className="space-y-3 rounded-lg border p-4 bg-muted/30">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Bank Transfer Details</h4>
                <Badge variant="outline" className="text-[10px] h-5">Official Account</Badge>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between group">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Account Name</p>
                    <p className="text-sm font-medium">{estateAccountName}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleCopy(estateAccountName, 'Account name')}
                  >
                    {copied ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                <div className="flex items-center justify-between group">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Account Number</p>
                    <p className="text-sm font-mono font-bold tracking-wider">{estateAccountNumber}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
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
                  <p className="text-[10px] text-muted-foreground">Bank Name</p>
                  <p className="text-sm font-medium">{estateBankName}</p>
                </div>
              </div>
            </div>

            {/* Manual Amount Input */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Amount Transferred (₦)</label>
              <input
                type="number"
                value={manualAmount}
                onChange={(e) => setManualAmount(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="0.00"
              />
            </div>

            {/* File Upload */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Upload Receipt / Proof</label>
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`
                  border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors
                  ${selectedFile ? 'border-green-500 bg-green-50 dark:bg-green-900/10' : 'border-muted-foreground/20 hover:border-primary/50 hover:bg-muted/50'}
                `}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                  accept="image/*,application/pdf"
                />

                {selectedFile ? (
                  <>
                    <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
                      <FileText className="h-5 w-5 text-green-600" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium truncate max-w-[200px]">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                    <Button variant="ghost" size="sm" className="mt-2 text-xs h-7" onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(null);
                    }}>Change File</Button>
                  </>
                ) : (
                  <>
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                      <Upload className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium">Click to upload receipt</p>
                      <p className="text-xs text-muted-foreground">PNG, JPG or PDF (max 5MB)</p>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                className="flex-1 gap-2"
                onClick={handleManualSent}
                disabled={isSubmitting || !selectedFile || !manualAmount}
              >
                {isSubmitting ? "Submitting..." : "I've Made Payment"}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="instant" className="space-y-4">
            <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800 text-center">
              <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-1">Instant Wallet Top-up</p>
              <p className="text-xs text-muted-foreground">Card and Bank Transfer options available through Paystack.</p>
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

            <div className="rounded-lg bg-muted p-3 flex items-start gap-3">
              <Info className="h-4 w-4 text-muted-foreground mt-0.5" />
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                By clicking "Pay Now", you will be redirected to Paystack's secure checkout. A transaction fee of 1.5% may apply. Funds are credited instantly.
              </p>
            </div>
          </TabsContent>
        </Tabs>

      </DialogContent>
    </Dialog>
  );
}
