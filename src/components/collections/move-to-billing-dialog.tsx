'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Textarea } from '@/components/ui/textarea';
import { ChargeCategorySelect } from '@/components/billing/charge-category-select';
import { getCollectionPayerOptions, type PayerOptions } from '@/actions/collections/collections';
import { moveCollectionPaymentToBilling } from '@/actions/collections/intake';
import { useResidentPropertiesForPayment } from '@/hooks/use-payments';
import { DEFAULT_CHARGE_CATEGORY } from '@/lib/billing/charge-categories';
import { formatCurrency } from '@/lib/utils';
import type { CollectionPayment } from '@/lib/collections/ledger';

const NO_HOUSE = 'none';

/**
 * #1195: a collection payment that was really a billing payment. The move reverses the collection
 * payment and records a payment that credits the resident's wallet and settles their invoices, in one
 * transaction.
 */
export function MoveToBillingDialog({ payment, onOpenChange }: {
  payment: CollectionPayment;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [options, setOptions] = useState<PayerOptions | null>(null);
  const [residentId, setResidentId] = useState(payment.payer?.resident_id ?? '');
  const [houseId, setHouseId] = useState(payment.house_id ?? NO_HOUSE);
  const [category, setCategory] = useState(DEFAULT_CHARGE_CATEGORY);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const { data: properties } = useResidentPropertiesForPayment(residentId || undefined);

  useEffect(() => {
    getCollectionPayerOptions().then((result) => setOptions(result.data ?? null));
  }, []);

  const submit = async () => {
    setSaving(true);
    const result = await moveCollectionPaymentToBilling(payment.id, {
      resident_id: residentId,
      house_id: houseId === NO_HOUSE ? null : houseId,
      charge_category: category,
      reason,
    });
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`${payment.receipt_number} moved to billing`);
    onOpenChange(false);
    router.refresh();
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move {payment.receipt_number} to billing</DialogTitle>
          <DialogDescription>
            The collection payment is reversed, and {formatCurrency(Number(payment.amount))} is recorded as a payment
            that credits the resident&apos;s wallet and pays their invoices. The move is recorded in the audit log.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Resident</Label>
          <SearchableSelect
            options={(options?.residents ?? []).map((resident) => ({ value: resident.id, label: resident.name, description: resident.detail }))}
            value={residentId}
            onValueChange={(value) => { setResidentId(value); setHouseId(NO_HOUSE); }}
            placeholder={options ? 'Choose a resident' : 'Loading…'}
            searchPlaceholder="Search residents"
            disabled={!options}
          />
        </div>
        <div className="space-y-2">
          <Label>House (optional)</Label>
          <SearchableSelect
            options={[
              { value: NO_HOUSE, label: 'Any house of the resident' },
              ...(properties?.data ?? []).map((house) => ({ value: house.houseId, label: `${house.houseNumber} ${house.streetName}`.trim() })),
            ]}
            value={houseId}
            onValueChange={setHouseId}
            searchPlaceholder="Search houses"
          />
        </div>
        <div className="space-y-2">
          <Label>Payment for</Label>
          <ChargeCategorySelect value={category} onChange={setCategory} />
        </div>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is it moved?" aria-label="Reason" />
        <DialogFooter className="gap-2">
          <Button disabled={saving || !residentId || !reason.trim()} onClick={submit}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Move to billing
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
