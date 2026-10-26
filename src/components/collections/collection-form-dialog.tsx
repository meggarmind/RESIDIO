'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { createCollection, updateCollection } from '@/actions/collections/collections';
import { COLLECTION_TYPE_LABELS, type Collection, type CollectionType } from '@/lib/collections/ledger';
import { lagosDateString } from '@/lib/whatsapp/assistant-format';

/** Create a collection, or change one (its type is fixed once made). */
export function CollectionFormDialog({ open, onOpenChange, collection }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collection?: Collection;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => ({
    name: collection?.name ?? '',
    description: collection?.description ?? '',
    collection_type: (collection?.collection_type ?? 'contribution') as CollectionType,
    opens_on: collection?.opens_on ?? lagosDateString(new Date()),
    closes_on: collection?.closes_on ?? '',
    target_amount: collection?.target_amount ?? 0,
    item_price: collection?.item_price ?? 0,
    non_resident_price: collection?.non_resident_price ?? 0,
    is_active: collection?.is_active ?? true,
  }));
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }));
  const isItem = form.collection_type === 'item_purchase';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const input = {
      ...form,
      target_amount: !isItem && form.target_amount ? form.target_amount : null,
      item_price: isItem ? form.item_price || null : null,
      non_resident_price: isItem && form.non_resident_price ? form.non_resident_price : null,
    };
    const result = collection ? await updateCollection(collection.id, input) : await createCollection(input);
    setSaving(false);
    if (result.error || !result.data) {
      toast.error(result.error ?? 'Could not save the collection');
      return;
    }
    toast.success(collection ? 'Collection saved' : 'Collection created');
    onOpenChange(false);
    if (collection) router.refresh();
    else router.push(`/collections/${result.data.id}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{collection ? 'Edit collection' : 'New collection'}</DialogTitle>
            <DialogDescription>Money collected outside billing. It never becomes a debt or wallet credit.</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="collection-name">Name</Label>
            <Input id="collection-name" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="End of Year Party 2026" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="collection-description">Description</Label>
            <Textarea id="collection-description" value={form.description} onChange={(e) => set('description', e.target.value)} rows={2} />
          </div>

          {!collection && (
            <div className="space-y-2">
              <Label>Type</Label>
              <RadioGroup value={form.collection_type} onValueChange={(value) => set('collection_type', value as CollectionType)} className="grid gap-2 sm:grid-cols-2">
                {(Object.keys(COLLECTION_TYPE_LABELS) as CollectionType[]).map((type) => (
                  <Label key={type} htmlFor={`type-${type}`} className="flex cursor-pointer items-start gap-2 rounded-xl border p-3 font-normal">
                    <RadioGroupItem id={`type-${type}`} value={type} className="mt-0.5" />
                    <span>
                      <span className="block font-medium">{COLLECTION_TYPE_LABELS[type]}</span>
                      <span className="text-xs text-muted-foreground">
                        {type === 'contribution' ? 'The payer chooses the amount' : 'The estate sets a price per item'}
                      </span>
                    </span>
                  </Label>
                ))}
              </RadioGroup>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="collection-opens">Opens on</Label>
              <Input id="collection-opens" type="date" value={form.opens_on} onChange={(e) => set('opens_on', e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="collection-closes">Closes on (optional)</Label>
              <Input id="collection-closes" type="date" value={form.closes_on} onChange={(e) => set('closes_on', e.target.value)} />
            </div>
          </div>

          {isItem ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="collection-price">Price per item (₦)</Label>
                <CurrencyInput id="collection-price" value={form.item_price || ''} onValueChange={(value) => set('item_price', value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="collection-nr-price">Non-resident price (₦, optional)</Label>
                <CurrencyInput id="collection-nr-price" value={form.non_resident_price || ''} onValueChange={(value) => set('non_resident_price', value)} />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="collection-target">Target (₦, optional)</Label>
              <CurrencyInput id="collection-target" value={form.target_amount || ''} onValueChange={(value) => set('target_amount', value)} />
            </div>
          )}

          {collection && (
            <div className="flex items-center justify-between rounded-xl border p-3">
              <Label htmlFor="collection-active" className="font-normal">Open for new payments</Label>
              <Switch id="collection-active" checked={form.is_active} onCheckedChange={(checked) => set('is_active', checked)} />
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button type="submit" disabled={saving} className="max-md:min-h-11">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="max-md:min-h-11">Cancel</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
