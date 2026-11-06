'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { FileImage, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Can } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { getPaymentProofUrl } from '@/actions/payments/get-payment-proof-url';

interface ViewReceiptButtonProps {
    paymentId: string;
    className?: string;
}

/**
 * #1455: opens the receipt a resident attached to a payment through a short-lived signed URL. Render it
 * only when the payment has a proof_url. It needs the permission getPaymentProofUrl enforces; without it,
 * one line says why.
 */
export function ViewReceiptButton({ paymentId, className }: ViewReceiptButtonProps) {
    const [opening, setOpening] = useState(false);

    async function open() {
        setOpening(true);
        try {
            const result = await getPaymentProofUrl(paymentId);
            if (result.url) {
                window.open(result.url, '_blank', 'noopener,noreferrer');
            } else {
                toast.error(result.error || 'Could not open the receipt');
            }
        } catch {
            toast.error('Could not open the receipt');
        } finally {
            setOpening(false);
        }
    }

    return (
        <Can
            permission={PERMISSIONS.PAYMENTS_UPDATE}
            fallback={<span className="text-xs text-muted-foreground">Receipt attached. Viewing it needs the payments update permission.</span>}
        >
            <Button size="sm" variant="outline" onClick={open} disabled={opening} className={className}>
                {opening ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileImage className="h-4 w-4 mr-1" />}
                View receipt
            </Button>
        </Can>
    );
}
