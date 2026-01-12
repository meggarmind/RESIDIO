'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createInvoiceCorrection } from '@/actions/billing/create-invoice-correction';
import { reversePaymentAllocation } from '@/actions/billing/reverse-payment-allocation';
import { formatCurrency } from '@/lib/utils';
import { Loader2, Plus, X, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { Invoice } from '@/types/database';

const correctionEntrySchema = z.object({
  type: z.enum(['credit', 'debit']),
  amount: z.number().positive('Amount must be greater than 0'),
  description: z.string().min(3, 'Description must be at least 3 characters'),
});

const correctionFormSchema = z
  .object({
    corrections: z.array(correctionEntrySchema).min(1, 'At least one correction entry is required'),
    reason: z.string().min(10, 'Reason must be at least 10 characters'),
  })
  .refine(
    (data) => {
      const credits = data.corrections
        .filter((c) => c.type === 'credit')
        .reduce((sum, c) => sum + c.amount, 0);
      const debits = data.corrections
        .filter((c) => c.type === 'debit')
        .reduce((sum, c) => sum + c.amount, 0);
      return Math.abs(credits - debits) < 0.01;
    },
    {
      message: 'Total credits must equal total debits',
      path: ['corrections'],
    }
  );

type CorrectionFormData = z.infer<typeof correctionFormSchema>;

type CorrectionEntry = z.infer<typeof correctionEntrySchema>;

interface InvoiceCorrectionDialogProps {
  invoice: Invoice;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function InvoiceCorrectionDialog({
  invoice,
  open,
  onOpenChange,
  onSuccess,
}: InvoiceCorrectionDialogProps) {
  const [corrections, setCorrections] = useState<CorrectionEntry[]>([
    { type: 'credit', amount: 0, description: '' },
  ]);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [reversing, setReversing] = useState(false);

  const {
    handleSubmit,
    formState: { errors },
  } = useForm<CorrectionFormData>({
    resolver: zodResolver(correctionFormSchema),
  });

  // Calculate totals
  const totalCredits = corrections
    .filter((c) => c.type === 'credit')
    .reduce((sum, c) => sum + (c.amount || 0), 0);

  const totalDebits = corrections
    .filter((c) => c.type === 'debit')
    .reduce((sum, c) => sum + (c.amount || 0), 0);

  const isBalanced = Math.abs(totalCredits - totalDebits) < 0.01;

  // Has partial payment?
  const hasPartialPayment = (invoice.amount_paid || 0) > 0;

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setCorrections([{ type: 'credit', amount: 0, description: '' }]);
      setReason('');
    }
  }, [open]);

  const addCorrectionRow = () => {
    setCorrections([...corrections, { type: 'credit', amount: 0, description: '' }]);
  };

  const removeCorrectionRow = (index: number) => {
    if (corrections.length > 1) {
      setCorrections(corrections.filter((_, i) => i !== index));
    }
  };

  const updateCorrection = (index: number, field: keyof CorrectionEntry, value: any) => {
    const updated = [...corrections];
    updated[index] = { ...updated[index], [field]: value };
    setCorrections(updated);
  };

  const handleReversePayment = async () => {
    if (!invoice.amount_paid || invoice.amount_paid <= 0) {
      toast.error('No payment to reverse');
      return;
    }

    setReversing(true);
    const result = await reversePaymentAllocation(invoice.id, invoice.amount_paid);
    setReversing(false);

    if (result.success) {
      toast.success(`Reversed ₦${formatCurrency(result.amountReversed)} payment allocation`);
      onSuccess(); // Refresh invoice data
    } else {
      toast.error(result.error || 'Failed to reverse payment');
    }
  };

  const onSubmit = async () => {
    // Validate manually since we're using controlled components
    if (corrections.length === 0) {
      toast.error('At least one correction entry is required');
      return;
    }

    if (!reason || reason.length < 10) {
      toast.error('Please provide a detailed reason (minimum 10 characters)');
      return;
    }

    if (!isBalanced) {
      toast.error('Credits must equal debits');
      return;
    }

    // Check for zero amounts
    if (corrections.some((c) => !c.amount || c.amount <= 0)) {
      toast.error('All correction amounts must be greater than 0');
      return;
    }

    // Check for empty descriptions
    if (corrections.some((c) => !c.description || c.description.length < 3)) {
      toast.error('All correction descriptions must be at least 3 characters');
      return;
    }

    setLoading(true);

    const result = await createInvoiceCorrection({
      originalInvoiceId: invoice.id,
      corrections,
      reason,
    });

    setLoading(false);

    if (result.success) {
      toast.success(
        `Created ${result.creditNotes.length} credit note(s) and ${result.debitNotes.length} debit note(s)`
      );

      if (result.warning) {
        toast.warning(result.warning);
      }

      if (result.emailSent) {
        toast.info('Email notification sent to resident');
      }

      onSuccess();
      onOpenChange(false);
    } else {
      toast.error(result.error || 'Failed to create correction');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Invoice Correction</DialogTitle>
          <DialogDescription>
            Create debit and credit notes to correct invoice {invoice.invoice_number}. Credits must
            equal debits to balance the correction.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Original Invoice Info */}
          <div className="bg-muted p-4 rounded-lg">
            <h3 className="font-semibold mb-2">Original Invoice</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Invoice Number:</span>{' '}
                <span className="font-medium">{invoice.invoice_number}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Amount Due:</span>{' '}
                <span className="font-medium">₦{formatCurrency(invoice.amount_due || 0)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Amount Paid:</span>{' '}
                <span className="font-medium">₦{formatCurrency(invoice.amount_paid || 0)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span>{' '}
                <span className="font-medium capitalize">{invoice.status}</span>
              </div>
            </div>
          </div>

          {/* Partial Payment Warning */}
          {hasPartialPayment && (
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
              <div className="flex items-start">
                <AlertCircle className="h-5 w-5 text-yellow-400 mr-2 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-semibold text-yellow-800">Partial Payment Detected</h4>
                  <p className="text-sm text-yellow-700 mt-1">
                    This invoice has been partially paid ({formatCurrency(invoice.amount_paid || 0)}
                    ). You must reverse the payment allocation before creating corrections.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleReversePayment}
                    disabled={reversing}
                    className="mt-2"
                  >
                    {reversing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Reversing...
                      </>
                    ) : (
                      'Reverse Payment Allocation'
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Correction Entries */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base">Correction Entries</Label>
              <Button variant="outline" size="sm" onClick={addCorrectionRow} type="button">
                <Plus className="h-4 w-4 mr-1" />
                Add Row
              </Button>
            </div>

            {corrections.map((correction, index) => (
              <div
                key={index}
                className="grid grid-cols-12 gap-3 items-start p-3 bg-muted/50 rounded-lg"
              >
                {/* Type Select */}
                <div className="col-span-3">
                  <Label htmlFor={`type-${index}`} className="text-xs mb-1 block">
                    Type
                  </Label>
                  <Select
                    value={correction.type}
                    onValueChange={(value) => updateCorrection(index, 'type', value as 'credit' | 'debit')}
                  >
                    <SelectTrigger id={`type-${index}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="credit">Credit Note</SelectItem>
                      <SelectItem value="debit">Debit Note</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Amount Input */}
                <div className="col-span-3">
                  <Label htmlFor={`amount-${index}`} className="text-xs mb-1 block">
                    Amount
                  </Label>
                  <CurrencyInput
                    id={`amount-${index}`}
                    value={correction.amount}
                    onChange={(value) => updateCorrection(index, 'amount', value)}
                    placeholder="0.00"
                  />
                </div>

                {/* Description Input */}
                <div className="col-span-5">
                  <Label htmlFor={`description-${index}`} className="text-xs mb-1 block">
                    Description
                  </Label>
                  <Input
                    id={`description-${index}`}
                    value={correction.description}
                    onChange={(e) => updateCorrection(index, 'description', e.target.value)}
                    placeholder="e.g., Security dues (corrected)"
                  />
                </div>

                {/* Remove Button */}
                <div className="col-span-1 flex items-end">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeCorrectionRow(index)}
                    disabled={corrections.length === 1}
                    type="button"
                    className="h-10 w-10"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Balance Summary */}
          <div className="bg-muted p-4 rounded-lg">
            <h3 className="font-semibold mb-3">Balance Check</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Total Credits</p>
                <p className="text-lg font-semibold text-red-600">
                  -₦{formatCurrency(totalCredits)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Total Debits</p>
                <p className="text-lg font-semibold text-green-600">
                  +₦{formatCurrency(totalDebits)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Balance</p>
                <p
                  className={`text-lg font-semibold ${
                    isBalanced ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {isBalanced ? '✓ Balanced' : `₦${formatCurrency(Math.abs(totalCredits - totalDebits))} off`}
                </p>
              </div>
            </div>
          </div>

          {/* Reason Input */}
          <div className="space-y-2">
            <Label htmlFor="reason">
              Reason for Correction <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Payment was misallocated - should be split between security dues and access card charges per receipt verification..."
              rows={4}
              className="resize-none"
            />
            <p className="text-sm text-muted-foreground">
              Minimum 10 characters. This will appear in audit logs and email notification to the
              resident.
            </p>
            {reason.length > 0 && reason.length < 10 && (
              <p className="text-sm text-red-500">
                {10 - reason.length} more character{10 - reason.length !== 1 ? 's' : ''} required
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={!isBalanced || loading || hasPartialPayment || reason.length < 10}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating Correction...
              </>
            ) : (
              'Create Correction'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
