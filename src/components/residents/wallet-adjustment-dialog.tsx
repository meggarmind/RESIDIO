'use client';

import { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useCreditWallet, useDebitWallet } from '@/hooks/use-wallet';
import { formatCurrency } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

const adjustmentSchema = z.object({
  type: z.enum(['credit', 'debit']),
  amount: z.number().positive('Amount must be greater than 0'),
  reason: z.enum(['adjustment', 'refund', 'penalty', 'correction', 'other']),
  description: z.string().min(10, 'Description must be at least 10 characters'),
});

type AdjustmentFormData = z.infer<typeof adjustmentSchema>;

interface WalletAdjustmentDialogProps {
  residentId: string;
  currentBalance: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WalletAdjustmentDialog({
  residentId,
  currentBalance,
  open,
  onOpenChange,
}: WalletAdjustmentDialogProps) {
  const creditMutation = useCreditWallet();
  const debitMutation = useDebitWallet();
  const [previewBalance, setPreviewBalance] = useState(currentBalance);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    control,
    formState: { errors },
  } = useForm<AdjustmentFormData>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: {
      type: 'credit',
      amount: 0,
      reason: 'adjustment',
      description: '',
    },
  });

  const type = watch('type');
  const amount = watch('amount');

  // Update preview when amount or type changes
  useEffect(() => {
    if (type === 'credit') {
      setPreviewBalance(currentBalance + (amount || 0));
    } else {
      setPreviewBalance(currentBalance - (amount || 0));
    }
  }, [amount, type, currentBalance]);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      reset({
        type: 'credit',
        amount: 0,
        reason: 'adjustment',
        description: '',
      });
      setPreviewBalance(currentBalance);
    }
  }, [open, reset, currentBalance]);

  const onSubmit = async (data: AdjustmentFormData) => {
    // Validate debit doesn't exceed balance
    if (data.type === 'debit' && data.amount > currentBalance) {
      return;
    }

    try {
      if (data.type === 'credit') {
        await creditMutation.mutateAsync({
          residentId,
          amount: data.amount,
          description: data.description,
          reason: data.reason,
        });
      } else {
        await debitMutation.mutateAsync({
          residentId,
          amount: data.amount,
          description: data.description,
          reason: data.reason,
        });
      }
      onOpenChange(false);
    } catch (error) {
      // Error is handled by mutation
    }
  };

  const isPending = creditMutation.isPending || debitMutation.isPending;
  const isDebitExceedingBalance = type === 'debit' && amount > currentBalance;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Adjust Wallet Balance</DialogTitle>
            <DialogDescription>Make a manual credit or debit to the resident's wallet</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Transaction Type */}
            <div className="grid gap-2">
              <Label>Transaction Type</Label>
              <RadioGroup
                value={type}
                onValueChange={(value) => setValue('type', value as 'credit' | 'debit')}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="credit" id="credit" />
                  <Label htmlFor="credit" className="cursor-pointer font-normal">
                    Credit (Add Funds)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="debit" id="debit" />
                  <Label htmlFor="debit" className="cursor-pointer font-normal">
                    Debit (Remove Funds)
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Amount */}
            <div className="grid gap-2">
              <Label htmlFor="amount">Amount</Label>
              <Controller
                name="amount"
                control={control}
                render={({ field }) => (
                  <CurrencyInput
                    id="amount"
                    value={field.value}
                    onValueChange={field.onChange}
                    placeholder="0.00"
                  />
                )}
              />
              {errors.amount && <p className="text-sm text-destructive">{errors.amount.message}</p>}
              {isDebitExceedingBalance && (
                <p className="text-sm text-destructive">
                  Cannot debit more than current balance ({formatCurrency(currentBalance)})
                </p>
              )}
            </div>

            {/* Reason */}
            <div className="grid gap-2">
              <Label htmlFor="reason">Reason</Label>
              <Select
                value={watch('reason')}
                onValueChange={(value) => setValue('reason', value as any)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="adjustment">Adjustment</SelectItem>
                  <SelectItem value="refund">Refund</SelectItem>
                  <SelectItem value="penalty">Penalty</SelectItem>
                  <SelectItem value="correction">Correction</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              {errors.reason && <p className="text-sm text-destructive">{errors.reason.message}</p>}
            </div>

            {/* Description */}
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Explain the reason for this adjustment..."
                rows={3}
                {...register('description')}
              />
              {errors.description && (
                <p className="text-sm text-destructive">{errors.description.message}</p>
              )}
            </div>

            {/* Impact Preview */}
            <div className="border rounded-lg p-4 bg-muted">
              <p className="text-sm font-medium mb-2">Impact Preview</p>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current Balance:</span>
                  <span className="font-medium">{formatCurrency(currentBalance)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Change:</span>
                  <span
                    className={
                      type === 'credit'
                        ? 'font-medium text-green-600 dark:text-green-400'
                        : 'font-medium text-red-600 dark:text-red-400'
                    }
                  >
                    {type === 'credit' ? '+' : '-'}
                    {formatCurrency(amount || 0)}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t">
                  <span className="font-medium">New Balance:</span>
                  <span className="font-bold">{formatCurrency(previewBalance)}</span>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || isDebitExceedingBalance}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Adjustment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
