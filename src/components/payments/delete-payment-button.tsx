'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { useDeletePayment } from '@/hooks/use-payments';

interface DeletePaymentButtonProps {
    paymentId: string;
    residentId?: string | null;
}

/**
 * Deletes a payment from its detail page, then returns to the resident it belonged to
 * (or the Payments list). Shown only to users holding the permission deletePayment enforces.
 */
export function DeletePaymentButton({ paymentId, residentId }: DeletePaymentButtonProps) {
    const [open, setOpen] = React.useState(false);
    const router = useRouter();
    const mutation = useDeletePayment();

    async function confirm(e: React.MouseEvent) {
        e.preventDefault();
        try {
            await mutation.mutateAsync(paymentId);
            setOpen(false);
            router.push(residentId ? `/residents/${residentId}` : '/payments');
        } catch {
            // useDeletePayment already toasts the error; keep the dialog open.
        }
    }

    return (
        <Can permission={PERMISSIONS.PAYMENTS_DELETE}>
            <Button variant="outline" className="text-destructive" onClick={() => setOpen(true)}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
            </Button>
            <AlertDialog open={open} onOpenChange={setOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete this payment?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete this payment record? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={confirm} disabled={mutation.isPending}>
                            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Delete payment
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Can>
    );
}
