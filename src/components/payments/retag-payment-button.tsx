'use client';

import * as React from 'react';
import { Loader2, Tags } from 'lucide-react';
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
import { ChargeCategorySelect } from '@/components/billing/charge-category-select';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { useRetagPayment } from '@/hooks/use-payments';

interface RetagPaymentButtonProps {
    paymentId: string;
    chargeCategory: string;
}

/**
 * #1190: change what a payment is for. The money moves from the wallet of the old category to the
 * wallet of the new one; the server refuses a payment that has already paid invoices.
 */
export function RetagPaymentButton({ paymentId, chargeCategory }: RetagPaymentButtonProps) {
    const [open, setOpen] = React.useState(false);
    const [category, setCategory] = React.useState(chargeCategory);
    const mutation = useRetagPayment();

    async function confirm(e: React.MouseEvent) {
        e.preventDefault();
        try {
            await mutation.mutateAsync({ id: paymentId, chargeCategory: category });
            setOpen(false);
        } catch {
            // the hook has already shown the error toast; keep the dialog open
        }
    }

    return (
        <Can permission={PERMISSIONS.BILLING_MANAGE_WALLETS}>
            <Button
                variant="outline"
                onClick={() => {
                    setCategory(chargeCategory);
                    setOpen(true);
                }}
            >
                <Tags className="h-4 w-4 mr-2" />
                Change category
            </Button>
            <AlertDialog open={open} onOpenChange={setOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Change what this payment is for?</AlertDialogTitle>
                        <AlertDialogDescription>
                            The amount moves from the resident&apos;s wallet of the current category to the wallet
                            of the new one and stays there as credit. The change is recorded in the audit log.
                            A payment that has already paid invoices must have that settlement reversed first.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <ChargeCategorySelect value={category} onChange={setCategory} />
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={confirm} disabled={mutation.isPending || category === chargeCategory}>
                            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Change category
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Can>
    );
}
