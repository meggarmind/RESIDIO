'use client';

import * as React from 'react';
import { Loader2, ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Can } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { useUnverifyPayment } from '@/hooks/use-payments';

interface UnverifyPaymentButtonProps {
    paymentId: string;
    isVerified: boolean | null | undefined;
}

/**
 * #502: the audited way to correct a verified payment. Shown only for verified payments
 * and only to users holding the permission unverifyPayment enforces.
 */
export function UnverifyPaymentButton({ paymentId, isVerified }: UnverifyPaymentButtonProps) {
    const [open, setOpen] = React.useState(false);
    const [reason, setReason] = React.useState('');
    const mutation = useUnverifyPayment();

    if (!isVerified) return null;

    async function confirm(e: React.MouseEvent) {
        e.preventDefault();
        try {
            await mutation.mutateAsync({ id: paymentId, reason: reason.trim() || undefined });
            setOpen(false);
            setReason('');
        } catch {
            // the hook has already shown the error toast; keep the dialog open
        }
    }

    return (
        <Can permission={PERMISSIONS.PAYMENTS_VERIFY}>
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
                <ShieldOff className="mr-2 h-3.5 w-3.5" />
                Un-verify
            </Button>
            <AlertDialog open={open} onOpenChange={setOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Un-verify this payment?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Its amount, resident, property and status become editable again, and the
                            change is recorded in the audit log. Re-verify it after correcting it.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <Textarea
                        placeholder="Reason (optional)"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                    />
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={confirm} disabled={mutation.isPending}>
                            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Un-verify
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Can>
    );
}
