'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { HandCoins, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCan } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { useOpenCollections } from '@/hooks/use-collections';
import { movePaymentToCollection } from '@/actions/collections/intake';
import { formatCurrency } from '@/lib/utils';

/**
 * #1195: a payment recorded as billing that was really for a collection. The move reverses what the
 * payment paid and its wallet credit, records the money in the collection and removes the payment, in
 * one transaction. The collection payment can be moved back to billing from the collection page.
 */
export function MoveToCollectionButton({ paymentId, amount }: { paymentId: string; amount: number }) {
    const router = useRouter();
    const canDelete = useCan(PERMISSIONS.PAYMENTS_DELETE);
    const canManageCollections = useCan(PERMISSIONS.COLLECTIONS_MANAGE);
    const [open, setOpen] = React.useState(false);
    const [collectionId, setCollectionId] = React.useState('');
    const [quantity, setQuantity] = React.useState(1);
    const [reason, setReason] = React.useState('');
    const [saving, setSaving] = React.useState(false);
    const { data: collections } = useOpenCollections(open);
    const isItem = collections?.find((c) => c.id === collectionId)?.collection_type === 'item_purchase';

    if (!canDelete || !canManageCollections) return null;

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        setSaving(true);
        const result = await movePaymentToCollection(paymentId, {
            collection_id: collectionId,
            quantity: isItem ? quantity : null,
            reason,
        });
        setSaving(false);
        if (result.error || !result.data) {
            toast.error(result.error ?? 'The payment could not be moved');
            return;
        }
        toast.success(`Moved to the collection: receipt ${result.data.receipt_number}`);
        setOpen(false);
        router.push('/payments');
    }

    return (
        <>
            <Button variant="outline" onClick={() => setOpen(true)}>
                <HandCoins className="h-4 w-4 mr-2" />
                Move to collection
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <form onSubmit={submit} className="space-y-4">
                        <DialogHeader>
                            <DialogTitle>Move this payment to a collection?</DialogTitle>
                            <DialogDescription>
                                {formatCurrency(amount)} leaves the resident&apos;s wallet, and anything it paid is unpaid again.
                                The money is recorded in the collection with its own receipt, and this payment is removed.
                                Refused when the credit has already been spent. The move is recorded in the audit log.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-2">
                            <Label>Collection</Label>
                            <Select value={collectionId} onValueChange={setCollectionId}>
                                <SelectTrigger aria-label="Collection"><SelectValue placeholder="Choose a collection" /></SelectTrigger>
                                <SelectContent>
                                    {(collections ?? []).map((c) => (
                                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {isItem && (
                            <div className="space-y-2">
                                <Label htmlFor="move-quantity">Quantity</Label>
                                <Input id="move-quantity" type="number" min={1} step={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} required />
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label htmlFor="move-reason">Reason</Label>
                            <Input id="move-reason" value={reason} onChange={(e) => setReason(e.target.value)} required />
                        </div>
                        <DialogFooter className="gap-2">
                            <Button type="submit" disabled={saving || !collectionId || !reason.trim()}>
                                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Move to collection
                            </Button>
                            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}
