'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { EMPTY_NOTIFIED_PARTY, NotifiedPartyFields } from '@/components/collections/notified-party-fields';
import { getCollectionPayerOptions, recordCollectionPayment, type NotifiedPartyInput, type PayerOptions } from '@/actions/collections/collections';
import {
  COLLECTION_PAYMENT_METHOD_LABELS,
  priceCollectionPayment,
  type Collection,
  type CollectionPaymentMethod,
} from '@/lib/collections/ledger';
import { lagosDateString } from '@/lib/whatsapp/assistant-format';
import { formatCurrency } from '@/lib/utils';

const NEW_PAYER = 'new';
const NO_HOUSE = 'none';

/** Record one payment into a collection, by hand. */
export function RecordPaymentDialog({ collection, open, onOpenChange }: {
  collection: Collection;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const isItem = collection.collection_type === 'item_purchase';
  const [options, setOptions] = useState<PayerOptions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [payerKind, setPayerKind] = useState<'resident' | 'non_resident'>('resident');
  const [residentId, setResidentId] = useState('');
  const [nonResidentId, setNonResidentId] = useState(NEW_PAYER);
  const [nonResident, setNonResident] = useState({ full_name: '', phone: '', email: '' });
  const [houseId, setHouseId] = useState(NO_HOUSE);
  const [quantity, setQuantity] = useState(1);
  const [amount, setAmount] = useState(0);
  const [paymentDate, setPaymentDate] = useState(lagosDateString(new Date()));
  const [method, setMethod] = useState<CollectionPaymentMethod>('bank_transfer');
  const [reference, setReference] = useState('');
  const [itemReference, setItemReference] = useState('');
  const [notes, setNotes] = useState('');
  const [notify, setNotify] = useState(false);
  const [party, setParty] = useState<NotifiedPartyInput>(EMPTY_NOTIFIED_PARTY);

  useEffect(() => {
    if (!open || options) return;
    getCollectionPayerOptions().then((result) => {
      if (result.error || !result.data) setLoadError(result.error ?? 'Payers could not be loaded');
      else setOptions(result.data);
    });
  }, [open, options]);

  const priced = priceCollectionPayment(collection, { isResident: payerKind === 'resident', quantity, amount });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const existing = options?.nonResidents.find((payer) => payer.id === nonResidentId);
    const payer = payerKind === 'resident'
      ? { kind: 'resident' as const, resident_id: residentId }
      : existing
        ? { kind: 'non_resident' as const, full_name: existing.full_name, phone: existing.phone, email: existing.email }
        : { kind: 'non_resident' as const, ...nonResident };
    if (payerKind === 'resident' && !residentId) {
      toast.error('Choose the resident who paid');
      return;
    }
    setSaving(true);
    const result = await recordCollectionPayment({
      collection_id: collection.id,
      payer,
      house_id: houseId === NO_HOUSE ? null : houseId,
      quantity: isItem ? quantity : null,
      amount: isItem ? null : amount,
      payment_date: paymentDate,
      method,
      reference,
      item_reference: itemReference,
      notes,
      notified_party: isItem && notify ? party : null,
    });
    setSaving(false);
    if (result.error || !result.data) {
      toast.error(result.error ?? 'Could not record the payment');
      return;
    }
    toast.success(`Payment recorded: receipt ${result.data.receipt_number}`, {
      description: result.data.notices.skipped.length ? `Not sent: ${result.data.notices.skipped.join('; ')}` : undefined,
    });
    onOpenChange(false);
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
            <DialogDescription>{collection.name}. The payment gets its own receipt number.</DialogDescription>
          </DialogHeader>

          {loadError && <p className="text-sm text-destructive">{loadError}</p>}

          <RadioGroup value={payerKind} onValueChange={(value) => setPayerKind(value as typeof payerKind)} className="grid grid-cols-2 gap-2">
            <Label htmlFor="payer-resident" className="flex cursor-pointer items-center gap-2 rounded-xl border p-3 font-normal">
              <RadioGroupItem id="payer-resident" value="resident" /> Resident
            </Label>
            <Label htmlFor="payer-non-resident" className="flex cursor-pointer items-center gap-2 rounded-xl border p-3 font-normal">
              <RadioGroupItem id="payer-non-resident" value="non_resident" /> Non-resident
            </Label>
          </RadioGroup>

          {payerKind === 'resident' ? (
            <div className="space-y-2">
              <Label>Resident</Label>
              <SearchableSelect
                options={(options?.residents ?? []).map((resident) => ({ value: resident.id, label: resident.name, description: resident.detail }))}
                value={residentId}
                onValueChange={setResidentId}
                placeholder={options ? 'Choose a resident' : 'Loading…'}
                searchPlaceholder="Search residents"
                disabled={!options}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Payer</Label>
                <SearchableSelect
                  options={[
                    { value: NEW_PAYER, label: 'New payer' },
                    ...(options?.nonResidents ?? []).map((payer) => ({ value: payer.id, label: payer.full_name, description: payer.phone ?? payer.email ?? undefined })),
                  ]}
                  value={nonResidentId}
                  onValueChange={setNonResidentId}
                  searchPlaceholder="Search earlier payers"
                />
              </div>
              {nonResidentId === NEW_PAYER && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="payer-name">Name</Label>
                    <Input id="payer-name" value={nonResident.full_name} onChange={(e) => setNonResident({ ...nonResident, full_name: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="payer-phone">Phone</Label>
                    <Input id="payer-phone" type="tel" value={nonResident.phone} onChange={(e) => setNonResident({ ...nonResident, phone: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="payer-email">Email</Label>
                    <Input id="payer-email" type="email" value={nonResident.email} onChange={(e) => setNonResident({ ...nonResident, email: e.target.value })} />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>House (optional)</Label>
            <SearchableSelect
              options={[{ value: NO_HOUSE, label: 'No house' }, ...(options?.houses ?? []).map((house) => ({ value: house.id, label: house.label }))]}
              value={houseId}
              onValueChange={setHouseId}
              placeholder="No house"
              searchPlaceholder="Search houses"
            />
          </div>

          {isItem ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="payment-quantity">Quantity</Label>
                <Input id="payment-quantity" type="number" min={1} step={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} required />
              </div>
              <div className="space-y-2">
                <Label>Amount</Label>
                <p className="flex h-9 items-center text-sm tabular-nums" aria-live="polite">
                  {'error' in priced ? priced.error : `${priced.quantity} x ${formatCurrency(priced.unitPrice ?? 0)} = ${formatCurrency(priced.amount)}`}
                </p>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="payment-item-reference">Item reference (optional)</Label>
                <Input id="payment-item-reference" value={itemReference} onChange={(e) => setItemReference(e.target.value)} placeholder="Plate number" />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="payment-amount">Amount (₦)</Label>
              <CurrencyInput id="payment-amount" value={amount || ''} onValueChange={setAmount} required />
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="payment-date">Date</Label>
              <Input id="payment-date" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Method</Label>
              <Select value={method} onValueChange={(value) => setMethod(value as CollectionPaymentMethod)}>
                <SelectTrigger aria-label="Method"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(COLLECTION_PAYMENT_METHOD_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment-reference">Reference (optional)</Label>
              <Input id="payment-reference" value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment-notes">Notes (optional)</Label>
              <Input id="payment-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          {isItem && (
            <div className="space-y-3 rounded-xl border p-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="payment-notify" className="font-normal">Tell someone about this payment only</Label>
                <Switch id="payment-notify" checked={notify} onCheckedChange={setNotify} />
              </div>
              {notify && <NotifiedPartyFields idPrefix="payment-party" value={party} onChange={setParty} />}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button type="submit" disabled={saving || !options} className="max-md:min-h-11">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record payment
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="max-md:min-h-11">Cancel</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
