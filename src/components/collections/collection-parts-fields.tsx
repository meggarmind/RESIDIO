'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { priceCollectionPayment, type Collection } from '@/lib/collections/ledger';
import { formatCurrency } from '@/lib/utils';

export interface CollectionPartState {
  collection_id: string;
  quantity: number;
  amount: number;
}

export const EMPTY_PART: CollectionPartState = { collection_id: '', quantity: 1, amount: 0 };

/** The amount of a part as the server will price it, or null while it is incomplete. */
export function partAmount(part: CollectionPartState, collections: Collection[], isResident: boolean): number | null {
  const collection = collections.find((c) => c.id === part.collection_id);
  if (!collection) return null;
  const priced = priceCollectionPayment(collection, { isResident, quantity: part.quantity, amount: part.amount });
  return 'error' in priced ? null : priced.amount;
}

/** The parts as the intake actions take them. */
export function toPartInputs(parts: CollectionPartState[], collections: Collection[]) {
  return parts.map((part) => {
    const isItem = collections.find((c) => c.id === part.collection_id)?.collection_type === 'item_purchase';
    return { collection_id: part.collection_id, quantity: isItem ? part.quantity : null, amount: isItem ? null : part.amount };
  });
}

/** One or more collection parts of a payment (#1195): the collection and its amount, or quantity for an item. */
export function CollectionPartsFields({ idPrefix, collections, isResident, value, onChange }: {
  idPrefix: string;
  /** Open collections only. */
  collections: Collection[];
  isResident: boolean;
  value: CollectionPartState[];
  onChange: (value: CollectionPartState[]) => void;
}) {
  const update = (index: number, changes: Partial<CollectionPartState>) =>
    onChange(value.map((part, i) => (i === index ? { ...part, ...changes } : part)));

  return (
    <div className="space-y-3">
      {value.map((part, index) => {
        const collection = collections.find((c) => c.id === part.collection_id);
        const isItem = collection?.collection_type === 'item_purchase';
        const amount = partAmount(part, collections, isResident);
        return (
          <div key={index} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto] sm:items-end">
            <div className="min-w-0 space-y-2">
              <Label>Collection</Label>
              <Select value={part.collection_id} onValueChange={(collection_id) => update(index, { collection_id })}>
                <SelectTrigger aria-label={`Collection ${index + 1}`}><SelectValue placeholder="Choose a collection" /></SelectTrigger>
                <SelectContent>
                  {collections.length === 0 ? (
                    <div className="p-2 text-center text-sm text-muted-foreground">No open collections</div>
                  ) : collections.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isItem ? (
              <div className="space-y-2">
                <Label htmlFor={`${idPrefix}-quantity-${index}`}>Quantity</Label>
                <Input
                  id={`${idPrefix}-quantity-${index}`}
                  type="number"
                  min={1}
                  step={1}
                  value={part.quantity}
                  onChange={(e) => update(index, { quantity: Number(e.target.value) })}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor={`${idPrefix}-amount-${index}`}>Amount (₦)</Label>
                <CurrencyInput id={`${idPrefix}-amount-${index}`} value={part.amount || ''} onValueChange={(amount) => update(index, { amount })} />
              </div>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove collection part ${index + 1}`}
              onClick={() => onChange(value.filter((_, i) => i !== index))}
              disabled={value.length === 1}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            {isItem && amount != null && (
              <p className="text-xs text-muted-foreground tabular-nums sm:col-span-3">
                {part.quantity} x {formatCurrency(amount / part.quantity)} = {formatCurrency(amount)}
              </p>
            )}
          </div>
        );
      })}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...value, EMPTY_PART])}>
        <Plus className="mr-2 h-4 w-4" /> Add collection part
      </Button>
    </div>
  );
}
