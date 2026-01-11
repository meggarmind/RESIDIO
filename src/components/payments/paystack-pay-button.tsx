'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CreditCard, Loader2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { initializePaystackPayment } from '@/actions/paystack';
import { formatCurrency, cn } from '@/lib/utils';

interface PaystackPayButtonProps {
  invoiceId: string;
  amount: number;
  invoiceNumber: string;
  disabled?: boolean;
  className?: string;
  variant?: 'default' | 'outline' | 'secondary';
  size?: 'default' | 'sm' | 'lg';
  fullWidth?: boolean;
}

/**
 * Paystack Pay Button Component
 *
 * Initiates online payment for an invoice via Paystack.
 * Uses redirect flow: initializes payment, redirects to Paystack,
 * user completes payment, returns to callback URL.
 */
export function PaystackPayButton({
  invoiceId,
  amount,
  invoiceNumber,
  disabled = false,
  className,
  variant = 'default',
  size = 'default',
  fullWidth = true,
}: PaystackPayButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handlePayment = async () => {
    if (amount <= 0) {
      toast.error('Invalid payment amount');
      return;
    }

    setIsLoading(true);

    try {
      // Build callback URL based on current origin
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const callbackUrl = `${origin}/portal/payments/callback`;

      const result = await initializePaystackPayment({
        invoice_id: invoiceId,
        callback_url: callbackUrl,
      });

      if (!result.success) {
        toast.error(result.error || 'Failed to initialize payment');
        return;
      }

      if (result.data?.authorization_url) {
        // Show a brief toast before redirect
        toast.success('Redirecting to payment page...');

        // Small delay for the toast to show
        setTimeout(() => {
          window.location.href = result.data!.authorization_url;
        }, 500);
      } else {
        toast.error('No payment URL received');
      }
    } catch (error) {
      console.error('Payment initialization error:', error);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handlePayment}
      disabled={disabled || isLoading || amount <= 0}
      variant={variant}
      size={size}
      className={cn(
        'gap-2',
        fullWidth && 'w-full',
        variant === 'default' && 'bg-emerald-600 hover:bg-emerald-700 text-white',
        className
      )}
    >
      {isLoading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Initializing...
        </>
      ) : (
        <>
          <CreditCard className="h-4 w-4" />
          Pay {formatCurrency(amount)} Online
          <ExternalLink className="h-3 w-3 opacity-70" />
        </>
      )}
    </Button>
  );
}

/**
 * Compact version for table rows or smaller contexts
 */
export function PaystackPayButtonCompact({
  invoiceId,
  amount,
  disabled = false,
  className,
}: {
  invoiceId: string;
  amount: number;
  disabled?: boolean;
  className?: string;
}) {
  const [isLoading, setIsLoading] = useState(false);

  const handlePayment = async () => {
    if (amount <= 0) {
      toast.error('Invalid payment amount');
      return;
    }

    setIsLoading(true);

    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const callbackUrl = `${origin}/portal/payments/callback`;

      const result = await initializePaystackPayment({
        invoice_id: invoiceId,
        callback_url: callbackUrl,
      });

      if (!result.success) {
        toast.error(result.error || 'Failed to initialize payment');
        return;
      }

      if (result.data?.authorization_url) {
        toast.success('Redirecting to payment page...');
        setTimeout(() => {
          window.location.href = result.data!.authorization_url;
        }, 500);
      }
    } catch (error) {
      console.error('Payment error:', error);
      toast.error('Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handlePayment}
      disabled={disabled || isLoading || amount <= 0}
      variant="outline"
      size="sm"
      className={cn('gap-1.5', className)}
    >
      {isLoading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <>
          <CreditCard className="h-3.5 w-3.5" />
          Pay Online
        </>
      )}
    </Button>
  );
}
